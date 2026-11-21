import {BlobSource, BufferTarget, EncodedPacket, EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output, VideoSampleSink, WEBM, WebMOutputFormat} from 'mediabunny'
import {HEIGHT, WIDTH} from './layout'
import {createDiagnostics, diagnosticError, VideoExportError, type PacketObservation, type VideoAttempt, type VideoResolution, type VideoStage} from './video-diagnostics'
import type {Document as Project} from './model'
import {renderFrame} from './render'
import {totalTime} from './timeline'

export const videoFps = 30
// Allow up to one millisecond of timestamp quantization. Frames are >33 ms apart.
const timestampToleranceUs = 1000
const keyFrameInterval = 2 * videoFps
const maxQueue = 8
const maxOutstanding = 24
const compressedLimit = 192 * 1024 * 1024
const candidates = [
  {codec: 'avc1.420028', family: 'avc', extension: 'mp4', mime: 'video/mp4'},
  {codec: 'avc1.42e028', family: 'avc', extension: 'mp4', mime: 'video/mp4'},
  {codec: 'avc1.4d0028', family: 'avc', extension: 'mp4', mime: 'video/mp4'},
  {codec: 'vp8', family: 'vp8', extension: 'webm', mime: 'video/webm'},
  {codec: 'vp09.00.40.08', family: 'vp9', extension: 'webm', mime: 'video/webm'},
] as const
type Candidate = typeof candidates[number]
export type VideoProgress = {frames: number; total: number; seconds: number; format: Candidate['extension']; width: number; height: number}
class VideoSizeError extends Error {}

const frameTimestamp = (index: number) => Math.round(index / videoFps * 1e6)

export function frameTiming(index: number, duration: number) {
  const start = index / videoFps
  const stamp = frameTimestamp(index)
  const end = Math.round(Math.min((index + 1) / videoFps, duration) * 1e6)
  return {start, stamp, length: Math.max(1, end - stamp)}
}

export function videoFilename(title: string, extension: Candidate['extension']) {
  const stem = Array.from(title.normalize('NFC').replace(/[^\p{L}\p{N}\p{M}_-]+/gu, '-').replace(/^-+|-+$/g, ''))
    .slice(0, 72).join('').replace(/-+$/g, '')
  return (stem && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) ? stem : 'text-lab') + '.' + extension
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason)
    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, {once: true})
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}
const yieldToPage = () => new Promise<void>(resolve => window.setTimeout(resolve, 0))

async function verify(file: File, width: number, height: number, signal: AbortSignal) {
  let disposed = false
  const input = new Input({source: new BlobSource(file), formats: [MP4, WEBM]})
  try {
    const track = await deadline(input.getPrimaryVideoTrack(), signal)
    if (!track || await deadline(track.getDisplayWidth(), signal) !== width || await deadline(track.getDisplayHeight(), signal) !== height) {
      throw new Error('The muxed file has incorrect dimensions.')
    }
    if (typeof VideoDecoder === 'function' && await deadline(track.canDecode(), signal)) {
      const sample = await deadline(new VideoSampleSink(track).getSample(0).then(data => {
        if (signal.aborted || disposed) data?.close()
        return data
      }), signal)
      if (!sample) throw new Error('The first video frame could not be decoded.')
      sample.close()
    }
  } finally {
    disposed = true
    input.dispose()
  }
}

async function encode(project: Project, surface: HTMLCanvasElement, ctx: CanvasRenderingContext2D, duration: number,
  candidate: Candidate, config: VideoEncoderConfig, signal: AbortSignal, report: (progress: VideoProgress) => void,
  inspection: VideoAttempt, verifyFile: boolean) {
  const total = Math.ceil(duration * videoFps)
  inspection.stage = 'mux start'
  const target = new BufferTarget()
  const output = new Output({
    format: candidate.family === 'avc' ? new Mp4OutputFormat({fastStart: 'reserve'}) : new WebMOutputFormat(),
    target,
  })
  const source = new EncodedVideoPacketSource(candidate.family)
  output.addVideoTrack(source, {maximumPacketCount: total})
  const queue: {chunk: EncodedVideoChunk; metadata?: EncodedVideoChunkMetadata}[] = []
  const expected = new Map<number, number>()
  const started = performance.now()
  let lastRequestedKey = -1
  let codecError: {error: Error; stage: VideoStage} | undefined
  let codecStage: VideoStage = 'encoder configure'
  let bytes = 0
  inspection.stage = 'encoder configure'
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {inspection.encoded++; queue.push({chunk, metadata})},
    error: error => {codecError = {error, stage: codecStage}},
  })
  const close = () => {if (encoder.state !== 'closed') encoder.close()}
  signal.addEventListener('abort', close, {once: true})
  let finished = false

  const update = () => report({frames: inspection.muxed, total, seconds: Math.min(inspection.muxed / videoFps, duration),
    format: candidate.extension, width: config.width, height: config.height})
  function check() {
    signal.throwIfAborted()
    if (codecError) {
      inspection.stage = codecError.stage
      throw codecError.error
    }
  }
  async function drain() {
    check()
    while (queue.length) {
      const {chunk, metadata} = queue.shift()!
      inspection.stage = 'encoder encode'
      const index = Math.round(chunk.timestamp * videoFps / 1e6)
      const stamp = frameTimestamp(index)
      const matches = index >= 0 && index < inspection.submitted &&
        Math.abs(stamp - chunk.timestamp) <= timestampToleranceUs
      const length = matches ? expected.get(stamp) : undefined
      const observe = (reason: PacketObservation['reason']): PacketObservation => ({
        reason, timestamp: chunk.timestamp, duration: chunk.duration, bytes: chunk.byteLength, type: chunk.type,
        matchedFrame: matches ? index : undefined, expectedTimestamp: matches ? stamp : undefined, exactPending: expected.has(chunk.timestamp),
        previousOutputs: matches && length === undefined ? 1 : 0,
        nearestPending: [...expected.keys()].sort((a, b) => Math.abs(a - chunk.timestamp) - Math.abs(b - chunk.timestamp)).slice(0, 3),
        submittedIndex: inspection.submitted - 1, lastRequestedKey, nativeQueue: encoder.encodeQueueSize,
        outputQueue: queue.length, elapsedMs: Math.round(performance.now() - started),
      })
      if (!chunk.byteLength || length === undefined) {
        const reason = !chunk.byteLength ? 'empty packet' : matches ? 'duplicate frame' : 'unexpected timestamp'
        inspection.packet = observe(reason)
        throw new Error(reason === 'empty packet' ? 'Encoded packet is empty' : reason === 'duplicate frame'
          ? 'Encoded packet repeats a frame' : 'Encoded packet has an unexpected timestamp')
      }
      if (stamp !== chunk.timestamp) {
        inspection.correctedTimestamps = (inspection.correctedTimestamps ?? 0) + 1
        inspection.firstCorrection ??= observe('timestamp corrected')
      }
      bytes += chunk.byteLength
      if (bytes > compressedLimit) {
        inspection.stage = 'memory limit'
        throw new VideoSizeError('The video exceeds the local memory limit.')
      }
      inspection.stage = 'mux packet'
      try {
        // Keep callbacks in decode order. Only restore the matched frame's presentation time.
        const packet = EncodedPacket.fromEncodedChunk(chunk)
        await abortable(source.add(packet.clone({timestamp: stamp / 1e6, duration: length / 1e6}), metadata), signal)
      } catch (error) {
        inspection.packet = observe('mux packet')
        throw error
      }
      expected.delete(stamp)
      inspection.muxed++
    }
  }
  async function flush() {
    inspection.stage = codecStage = 'encoder flush'
    try {
      await deadline(encoder.flush(), signal)
    } catch (error) {
      check()
      throw error
    }
    codecStage = 'encoder encode'
    await drain()
    inspection.stage = 'encoder flush'
    if (expected.size) {
      inspection.missingTimestamps = [...expected.keys()].slice(0, 3)
      throw new Error('The encoder dropped video frames.')
    }
  }

  try {
    check()
    encoder.configure(config)
    codecStage = 'encoder encode'
    inspection.stage = 'mux start'
    await abortable(output.start(), signal)
    update()
    let lastReport = 0
    let lastWork = performance.now()
    for (let i = 0; i < total; i++) {
      if (i % 2 === 0) await yieldToPage()
      await drain()
      while (encoder.encodeQueueSize >= maxQueue) {
        inspection.stage = 'encoder encode'
        if (performance.now() - lastWork > 500) {
          await flush()
          break
        }
        await new Promise(resolve => window.setTimeout(resolve, 5))
        await drain()
      }
      if (expected.size >= maxOutstanding) await flush()
      if (inspection.muxed >= lastReport + 8) {update(); lastReport = inspection.muxed}
      check()
      lastWork = performance.now()
      inspection.stage = 'render frame'
      const {start, stamp, length} = frameTiming(i, duration)
      if (!(start < duration)) throw new Error('Video frame falls beyond the composition.')
      expected.set(stamp, length)
      renderFrame(ctx, project, start)
      inspection.stage = 'create VideoFrame'
      const frame = new VideoFrame(surface, {timestamp: stamp, duration: length, alpha: 'discard'})
      try {
        inspection.stage = 'encoder encode'
        const keyFrame = i % keyFrameInterval === 0
        encoder.encode(frame, {keyFrame})
        if (keyFrame) lastRequestedKey = i
        inspection.submitted++
        inspection.peakQueue = Math.max(inspection.peakQueue, encoder.encodeQueueSize)
        inspection.peakOutstanding = Math.max(inspection.peakOutstanding, expected.size)
      } finally {
        frame.close()
      }
    }
    await flush()
    close()
    update()
    inspection.stage = 'mux finalize'
    await deadline(output.finalize(), signal)
    finished = true
    signal.throwIfAborted()
    if (!target.buffer?.byteLength || inspection.muxed !== total) throw new Error('The encoder did not produce a complete video.')
    const file = new File([target.buffer], videoFilename(project.title, candidate.extension), {type: candidate.mime})
    inspection.stage = 'file validation'
    if (verifyFile) await verify(file, config.width, config.height, signal)
    return file
  } finally {
    signal.removeEventListener('abort', close)
    close()
    queue.length = 0
    if (!finished) await output.cancel().catch(() => {})
  }
}

async function deadline<T>(promise: Promise<T>, signal: AbortSignal) {
  let timer = 0
  try {
    return await abortable(Promise.race([promise, new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new DOMException('Operation timed out.', 'TimeoutError')), 12000)
    })]), signal)
  } finally {
    window.clearTimeout(timer)
  }
}

export async function exportVideo(project: Project, signal: AbortSignal, report: (progress: VideoProgress) => void,
  resolution: VideoResolution = '1080p') {
  const duration = totalTime(project)
  const job = createDiagnostics(resolution, videoFps, Math.ceil(duration * videoFps))
  const started = performance.now()
  const safari = job.browser.startsWith('Safari') || /iPhone|iPad|iPod/.test(navigator.userAgent)
  const surface = document.createElement('canvas')
  let runtimeFailure: VideoAttempt | undefined
  function failure(message: string) {return new VideoExportError(message, job)}
  try {
    if (!globalThis.VideoEncoder || !globalThis.VideoFrame || typeof VideoEncoder.isConfigSupported !== 'function') {
      throw failure('This browser cannot encode video locally. Export JSON and open it in a current desktop Safari or Chromium browser.')
    }
    job.stage = 'fonts'
    await abortable(document.fonts.ready, signal)
    job.stage = 'canvas allocation'
    surface.width = job.width
    surface.height = job.height
    const ctx = surface.getContext('2d', {alpha: false})
    if (!ctx) throw new Error('Canvas allocation failed.')
    ctx.setTransform(job.width / WIDTH, 0, 0, job.height / HEIGHT, 0, 0)
    const order = safari
      ? [candidates[1], candidates[2], candidates[0], candidates[3], candidates[4]]
      : candidates
    const settings = order.flatMap(candidate => {
      const primary = {candidate, latencyMode: safari && candidate.family === 'avc' ? 'quality' as const : 'realtime' as const}
      return safari && candidate.family === 'avc'
        ? [primary, {candidate, latencyMode: 'realtime' as const}] : [primary]
    })
    for (const {candidate, latencyMode} of settings) {
      signal.throwIfAborted()
      const bitrate = resolution === '720p' ? 3_500_000 : safari ? 5_000_000 : 8_000_000
      const codec = resolution === '720p' && candidate.family === 'avc'
        ? candidate.codec.slice(0, -2) + '1f' : candidate.codec
      const config: VideoEncoderConfig = {
        codec, width: job.width, height: job.height, bitrate,
        framerate: videoFps, latencyMode,
        ...(candidate.family === 'avc' && {avc: {format: 'avc'}}),
      }
      const start = performance.now()
      const attempt: VideoAttempt = {codec, latencyMode, bitrate, result: 'checking',
        stage: 'codec support', submitted: 0, encoded: 0, muxed: 0, peakQueue: 0, peakOutstanding: 0, elapsedMs: 0}
      job.attempts.push(attempt)
      try {
        const support = await abortable(VideoEncoder.isConfigSupported(config), signal)
        attempt.supported = support.supported === true
        if (!attempt.supported) {attempt.result = 'unsupported'; continue}
        const file = await encode(project, surface, ctx, duration, candidate, config, signal, report, attempt, safari)
        attempt.result = 'complete'
        job.stage = attempt.stage
        job.error = undefined
        return {file, diagnostics: job}
      } catch (error) {
        attempt.result = signal.aborted ? 'cancelled' : 'failed'
        const info = diagnosticError(error, attempt.stage)
        attempt.error = info
        if (attempt.supported) runtimeFailure = attempt
        job.stage = attempt.stage
        job.error = info
        signal.throwIfAborted()
        if (error instanceof VideoSizeError || info.name === 'QuotaExceededError' ||
            info.message.includes('enough memory')) {
          job.stage = 'memory limit'
          throw failure('The browser ran out of memory or exceeded the local video limit.')
        }
      } finally {
        attempt.elapsedMs = Math.round(performance.now() - start)
      }
    }
    if (runtimeFailure) {
      job.stage = runtimeFailure.stage
      job.error = runtimeFailure.error
      throw failure(`The browser could not finish encoding at ${job.stage}. See diagnostics for each codec attempt.`)
    }
    job.stage = 'codec support'
    throw failure(`No supported H.264, VP8 or VP9 encoder at ${job.width} × ${job.height} was found.`)
  } catch (error) {
    if (signal.aborted) {
      job.stage = 'abort'
      job.error = diagnosticError(error, 'abort')
      throw failure('Video export cancelled.')
    }
    if (error instanceof VideoExportError) throw error
    job.error = diagnosticError(error, job.stage)
    throw failure(`Video export failed at ${job.stage}. See diagnostics for details.`)
  } finally {
    surface.width = surface.height = 0
    job.elapsedMs = Math.round(performance.now() - started)
  }
}
