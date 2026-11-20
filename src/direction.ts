export const impacts = ['Default', 'Cut', 'Flash', 'Impact Zoom'] as const
export type Impact = {kind: 'Cut'} | {kind: 'Flash' | 'Impact Zoom'; duration: number; intensity: number}
export type Framing = {x?: number; y?: number; zoom?: number; crop?: boolean}
export type Cue =
  | {at: number; duration: number; target: 'Text'; action: 'Show' | 'Hide'}
  | {at: number; duration: number; target: 'Text'; action: 'Scale'; value: number}
  | {at: number; duration: number; target: number; action: 'Move'; x: number; y: number}
  | {at: number; duration: number; target: number; action: 'Scale'; value: number}
  | {at: number; duration: number; target: number; action: 'Show' | 'Hide'}
export const maxCues = 20
const between = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
function record(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}
const only = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).every(key => keys.includes(key))
export function validImpact(value: unknown): value is Impact {
  if (!record(value)) return false
  if (value.kind === 'Cut') return only(value, ['kind'])
  return (value.kind === 'Flash' || value.kind === 'Impact Zoom') &&
    only(value, ['kind', 'duration', 'intensity']) && between(value.duration, 0.04, 0.6) && between(value.intensity, 0, 100)
}
export function validFraming(value: unknown): value is Framing {
  return record(value) && only(value, ['x', 'y', 'zoom', 'crop']) &&
    (value.x === undefined || between(value.x, 0, 100)) && (value.y === undefined || between(value.y, 0, 100)) &&
    (value.zoom === undefined || between(value.zoom, 50, 340)) && (value.crop === undefined || typeof value.crop === 'boolean')
}
const channel = (cue: Cue) => cue.target + ':' + (cue.action === 'Show' || cue.action === 'Hide' ? 'Visibility' : cue.action)

export function validCues(value: unknown, duration: number, shapes: number): value is Cue[] {
  if (!Array.isArray(value) || value.length > maxCues) return false
  const last = new Map<string, {at: number; end: number}>()
  let previous = 0
  for (const cue of value) {
    if (!record(cue) || !between(cue.at, previous, duration) || cue.at === duration ||
        !between(cue.duration, 0, duration) || Number(cue.at) + Number(cue.duration) > duration + 1e-9) return false
    const shape = Number.isInteger(cue.target) && between(cue.target, 0, shapes - 1)
    if (cue.target !== 'Text' && !shape) return false
    const keys = ['at', 'duration', 'target', 'action']
    if (cue.action === 'Move') {
      if (!shape || !only(cue, [...keys, 'x', 'y']) || !between(cue.x, -100, 200) || !between(cue.y, -100, 200)) return false
    } else if (cue.action === 'Scale') {
      if (!only(cue, [...keys, 'value']) || !between(cue.value, 10, 300)) return false
    } else if ((cue.action !== 'Show' && cue.action !== 'Hide') || !only(cue, keys)) return false
    const accepted = cue as Cue
    const lane = channel(accepted)
    const prior = last.get(lane)
    if (prior && (prior.at === accepted.at || prior.end > accepted.at + 1e-9)) return false
    previous = accepted.at
    last.set(lane, {at: accepted.at, end: accepted.at + accepted.duration})
  }
  return true
}

export function cuePose(cues: Cue[] | undefined, target: Cue['target'], time: number, x = 50, y = 48) {
  let alpha = 1
  let scale = 1
  if (cues) for (const cue of cues) {
    if (cue.at > time + 1e-9) break
    if (cue.target !== target) continue
    const p = cue.duration === 0 ? 1 : Math.max(0, Math.min(1, (time - cue.at) / cue.duration))
    const eased = p * p * (3 - 2 * p)
    if (cue.action === 'Show' || cue.action === 'Hide') alpha += ((cue.action === 'Show' ? 1 : 0) - alpha) * eased
    if (cue.action === 'Scale') scale += (cue.value / 100 - scale) * eased
    if (cue.action === 'Move') {
      x += (cue.x - x) * eased
      y += (cue.y - y) * eased
    }
  }
  return {alpha, scale, x, y}
}
