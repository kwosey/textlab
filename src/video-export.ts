import {BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output, WebMOutputFormat} from 'mediabunny'
import {HEIGHT, WIDTH} from './layout'
import type {Document as Project} from './model'
import {renderFrame} from './render'
import {totalTime} from './timeline'

export const videoFps = 30
const batchSize = 8
const compressedLimit = 192 * 1024 * 1024
const candidates = [
  {codec: 'avc1.420028', family: 'avc', extension: 'mp4', mime: 'video/mp4'},
  {codec: 'avc1.42e028', family: 'avc', extension: 'mp4', mime: 'video/mp4'},
  {codec: 'avc1.4d0028', family: 'avc', extension: 'mp4', mime: 'video/mp4'},
  {codec: 'vp8', family: 'vp8', extension: 'webm', mime: 'video/webm'},
  {codec: 'vp09.00.40.08', family: 'vp9', extension: 'webm', mime: 'video/webm'},
] as const
type Candidate = typeof candidates[number]
export type VideoProgress = {frames: number; total: number; seconds: number; format: Candidate['extension']}
class VideoSizeError extends Error {}

export function frameTiming(index: number, duration: number) {
  const start = index / videoFps
  const stamp = Math.round(start * 1e6)
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

async function encode(project: Project, surface: HTMLCanvasElement, ctx: CanvasRenderingContext2D, duration: number,
  candidate: Candidate, config: VideoEncoderConfig, signal: AbortSignal, report: (progress: VideoProgress) => void) {
  const total = Math.ceil(duration * videoFps)
  const target = new BufferTarget()
  const output = new Output({
    format: candidate.family === 'avc' ? new Mp4OutputFormat({fastStart: false}) : new WebMOutputFormat(),
    target,
  })
  const source = new EncodedVideoPacketSource(candidate.family)
  output.addVideoTrack(source)
  const batch: {chunk: EncodedVideoChunk; metadata?: EncodedVideoChunkMetadata}[] = []
  let codecError: Error | undefined
  let bytes = 0
  let written = 0
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => batch.push({chunk, metadata}),
    error: error => {codecError = error},
  })
  const close = () => {if (encoder.state !== 'closed') encoder.close()}
  signal.addEventListener('abort', close, {once: true})
  let finished = false
  try {
    signal.throwIfAborted()
    encoder.configure(config)
    await abortable(output.start(), signal)
    report({frames: 0, total, seconds: 0, format: candidate.extension})
    for (let first = 0; first < total; first += batchSize) {
      await yieldToPage()
      const last = Math.min(total, first + batchSize)
      const expected = new Map<number, number>()
      for (let i = first; i < last; i++) {
        if (i !== first && (i - first) % 2 === 0) await yieldToPage()
        signal.throwIfAborted()
        if (codecError) throw codecError
        const {start, stamp, length} = frameTiming(i, duration)
        if (!(start < duration)) throw new Error('Video frame falls beyond the composition.')
        expected.set(stamp, length)
        renderFrame(ctx, project, start)
        const frame = new VideoFrame(surface, {timestamp: stamp, duration: length, alpha: 'discard'})
        try {
          encoder.encode(frame, {keyFrame: i % (2 * videoFps) === 0})
        } finally {
          frame.close()
        }
      }
      await abortable(encoder.flush(), signal)
      if (codecError) throw codecError
      for (const {chunk, metadata} of batch) {
        const length = expected.get(chunk.timestamp)
        if (!length || !chunk.byteLength) throw new Error('The encoder returned incorrect frame timestamps or empty data.')
        expected.delete(chunk.timestamp)
        bytes += chunk.byteLength
        if (bytes > compressedLimit) throw new VideoSizeError('This video exceeds the local memory limit. Shorten the composition and try again.')
        const packet = EncodedPacket.fromEncodedChunk(chunk)
        await abortable(source.add(packet.clone({duration: length / 1e6}), metadata), signal)
        written++
      }
      if (expected.size) throw new Error('The encoder dropped video frames.')
      batch.length = 0
      report({frames: written, total, seconds: Math.min(written / videoFps, duration), format: candidate.extension})
    }
    await abortable(output.finalize(), signal)
    signal.throwIfAborted()
    if (!target.buffer?.byteLength || written !== total) throw new Error('The encoder did not produce a complete video.')
    const blob = new Blob([target.buffer], {type: candidate.mime})
    finished = true
    return new File([blob], videoFilename(project.title, candidate.extension), {type: candidate.mime})
  } finally {
    signal.removeEventListener('abort', close)
    close()
    batch.length = 0
    if (!finished) await output.cancel().catch(() => {})
  }
}

export async function exportVideo(project: Project, signal: AbortSignal, report: (progress: VideoProgress) => void) {
  if (!globalThis.VideoEncoder || !globalThis.VideoFrame || typeof VideoEncoder.isConfigSupported !== 'function') {
    throw new Error('This browser cannot encode video locally. Use current Safari or Chromium over HTTPS, or export the JSON and open it on another device.')
  }
  await abortable(document.fonts.ready, signal)
  const surface = document.createElement('canvas')
  surface.width = WIDTH
  surface.height = HEIGHT
  const duration = totalTime(project)
  let attempted = false
  let failure: unknown
  try {
    const ctx = surface.getContext('2d', {alpha: false})
    if (!ctx) throw new Error('The browser could not allocate the 1080 × 1920 export canvas. Close other tabs and try again.')
    for (const candidate of candidates) {
      signal.throwIfAborted()
      const config: VideoEncoderConfig = {
        codec: candidate.codec, width: WIDTH, height: HEIGHT,
        bitrate: 8_000_000, framerate: videoFps, latencyMode: 'realtime',
        ...(candidate.family === 'avc' && {avc: {format: 'avc'}}),
      }
      try {
        const support = await abortable(VideoEncoder.isConfigSupported(config), signal)
        if (!support.supported) continue
        attempted = true
        return await encode(project, surface, ctx, duration, candidate, config, signal, report)
      } catch (error) {
        signal.throwIfAborted()
        if (error instanceof VideoSizeError) throw error
        failure = error
      }
    }
    if (attempted) {
      console.warn('Text Lab video encoding failed', failure)
      throw new Error('The browser could not finish encoding. Close other tabs, try a shorter composition, or open its JSON on another device.')
    }
    throw new Error('No supported H.264, VP8 or VP9 encoder at 1080 × 1920 was found. Try a current Safari or Chromium browser on another device.')
  } finally {
    surface.width = surface.height = 0
  }
}
