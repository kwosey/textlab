export type VideoResolution = '1080p' | '720p'
export const resolutions = {'1080p': {width: 1080, height: 1920}, '720p': {width: 720, height: 1280}}

export type VideoStage = 'API' | 'fonts' | 'canvas allocation' | 'codec support' | 'encoder configure' |
  'render frame' | 'create VideoFrame' | 'encoder encode' | 'encoder flush' |
  'mux start' | 'mux packet' | 'mux finalize' | 'file validation' | 'browser playback' | 'memory limit' | 'abort'

export type PacketObservation = {
  reason: 'timestamp corrected' | 'unexpected timestamp' | 'duplicate frame' | 'empty packet' | 'mux packet'
  timestamp: number
  duration: number | null
  bytes: number
  type: EncodedVideoChunkType
  matchedFrame?: number
  expectedTimestamp?: number
  exactPending: boolean
  previousOutputs: number
  nearestPending: number[]
  submittedIndex: number
  lastRequestedKey: number
  nativeQueue: number
  outputQueue: number
  elapsedMs: number
}
type DiagnosticError = {name: string; message: string}
export type VideoAttempt = {
  codec: string
  latencyMode: 'quality' | 'realtime'
  bitrate: number
  supported?: boolean
  result: 'checking' | 'unsupported' | 'failed' | 'cancelled' | 'complete'
  stage: VideoStage
  error?: DiagnosticError
  encoded: number
  muxed: number
  submitted: number
  peakQueue: number
  peakOutstanding: number
  elapsedMs: number
  correctedTimestamps?: number
  packet?: PacketObservation
  firstCorrection?: PacketObservation
  missingTimestamps?: number[]
}
export type VideoDiagnostics = {
  browser: string
  os: string
  memoryGiB?: number
  width: number
  height: number
  fps: number
  total: number
  elapsedMs: number
  attempts: VideoAttempt[]
  stage: VideoStage
  error?: DiagnosticError
}

export function createDiagnostics(resolution: VideoResolution, fps: number, total: number): VideoDiagnostics {
  const ua = navigator.userAgent
  const version = ua.match(/(CriOS|FxiOS|EdgiOS|Edg|Chrome|Firefox)\/([\d.]+)/)
  const safari = ua.match(/Version\/([\d.]+).*Safari/)
  const os = ua.match(/(?:CPU (?:iPhone )?OS|Mac OS X|Android|Windows NT) [\d._]+/)?.[0]?.replaceAll('_', '.')
  const memoryGiB = (navigator as Navigator & {deviceMemory?: number}).deviceMemory
  return {browser: version ? version[1] + ' ' + version[2] : safari ? 'Safari ' + safari[1] : 'Unknown browser',
    os: os ?? (/Linux/.test(ua) ? 'Linux (version unavailable)' : 'Unavailable'), memoryGiB,
    ...resolutions[resolution], fps, total, elapsedMs: 0, attempts: [], stage: 'API'}
}

// Browser errors may echo inputs. Keep only recognizable, non-content-bearing reasons.
export function diagnosticError(error: unknown, stage: VideoStage): DiagnosticError {
  const raw = error instanceof Error ? error.message : ''
  const name = error instanceof Error && /^(Error|TypeError|RangeError|AbortError|EncodingError|NotSupportedError|InvalidStateError|OperationError|QuotaExceededError|SecurityError|NotAllowedError|TimeoutError|DataError)$/.test(error.name)
    ? error.name : 'Error'
  const reasons: [RegExp, string][] = [
    [/out of memory|allocation failed|insufficient memory|not enough memory|failed to allocate/i, 'The browser could not allocate enough memory.'],
    [/quota|memory limit/i, 'The job exceeded a storage or memory limit.'],
    [/Encoded packet has an unexpected timestamp/, 'The packet timestamp does not match a submitted frame.'],
    [/Encoded packet repeats a frame/, 'The encoder returned a second packet for an already matched frame.'],
    [/Encoded packet is empty/, 'The encoder returned a zero-byte packet.'],
    [/dropped video frames/i, 'The encoder did not return packets for all submitted frames.'],
    [/decoder configuration|avcC|annex b/i, 'The encoder did not supply usable AVC container configuration.'],
    [/not supported|unsupported/i, 'The browser rejected this configuration or operation.'],
    [/hardware|resource exhausted/i, 'The browser reported unavailable codec resources.'],
    [/closed|unconfigured|invalid state/i, 'The browser codec was closed or in an invalid state.'],
    [/timed out|timeout/i, 'The browser did not respond before the timeout.'],
    [/encoder failure|encoding failed/i, 'The browser reported an encoder failure.'],
  ]
  const reason = reasons.find(([pattern]) => pattern.test(raw))?.[1]
  const fallback: Partial<Record<VideoStage, string>> = {
    'render frame': 'The composition renderer threw while drawing the frame.',
    'create VideoFrame': 'The browser could not create a frame from the canvas.',
    'encoder configure': 'The browser rejected encoder configuration after negotiation.',
    'mux packet': 'The container writer rejected an encoded packet.',
    'mux finalize': 'The container writer could not finalize the file.',
    'file validation': 'The resulting video could not be verified.',
    'browser playback': 'The local player could not open or decode this video.',
    abort: 'The export was cancelled.',
  }
  return {name, message: reason ?? fallback[stage] ?? 'The browser did not supply a recognized reason for this stage.'}
}

function packetText(packet: PacketObservation) {
  return `${packet.reason}: PTS ${packet.timestamp} µs; duration ${packet.duration ?? 'unavailable'} µs; ${packet.bytes} bytes; ${packet.type}; matched frame ${packet.matchedFrame ?? 'none'}; exact pending ${packet.exactPending}; prior packets for timestamp/frame ${packet.previousOutputs}; intended PTS ${packet.expectedTimestamp ?? 'none'} µs; nearest pending PTS [${packet.nearestPending.join(', ')}] µs; submitted index ${packet.submittedIndex}; last requested keyframe ${packet.lastRequestedKey}; native/output queue ${packet.nativeQueue}/${packet.outputQueue}; ${packet.elapsedMs} ms`
}

export function diagnosticText(job: VideoDiagnostics) {
  const lines = [
    'Text Lab video diagnostics',
    `Browser: ${job.browser}; OS: ${job.os}; Device memory hint: ${job.memoryGiB ?? 'unavailable'}${job.memoryGiB ? ' GiB' : ''}`,
    `Target: ${job.width} × ${job.height}, ${job.fps} fps; ${job.total} frames; ${job.elapsedMs} ms`,
    `Stage: ${job.stage}${job.error ? ` · ${job.error.name}: ${job.error.message}` : ''}`,
    ...job.attempts.flatMap(attempt => [`${attempt.codec} / ${attempt.latencyMode} / ${attempt.bitrate / 1e6} Mbps · ${attempt.result} at ${attempt.stage}; support: ${attempt.supported ?? 'unknown'}; submitted/encoded/muxed: ${attempt.submitted}/${attempt.encoded}/${attempt.muxed}; peak queue/outstanding: ${attempt.peakQueue}/${attempt.peakOutstanding}; ${attempt.elapsedMs} ms${attempt.error ? ` · ${attempt.error.name}: ${attempt.error.message}` : ''}`,
      ...(attempt.firstCorrection ? [`Corrected timestamps: ${attempt.correctedTimestamps}. First: ${packetText(attempt.firstCorrection)}`] : []),
      ...(attempt.packet ? [packetText(attempt.packet)] : []),
      ...(attempt.missingTimestamps ? [`Missing packet PTS [${attempt.missingTimestamps.join(', ')}] µs`] : []),
    ]),
  ]
  return lines.join('\n')
}

export class VideoExportError extends Error {
  constructor(message: string, public diagnostics: VideoDiagnostics) {super(message)}
}
