import type { Beat, Document } from './model'
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
export const smooth = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p) }

export function overlapLimit(beat: Beat, next?: Beat) {
  return next ? Math.min(2, Math.floor(Math.min(beat.duration, next.duration) * 4.5) / 10) : 0
}
export function overlap(beat: Beat, next?: Beat) {
  return Math.min(beat.placement?.overlap ?? 0, overlapLimit(beat, next))
}
export const beatStart = (doc: Document, index: number) => doc.beats.slice(0, index)
  .reduce((sum, beat, i) => sum + beat.duration - overlap(beat, doc.beats[i + 1]), 0)
export const totalTime = (doc: Document) => beatStart(doc, doc.beats.length)

export function locate(doc: Document, seconds: number) {
  const time = clamp(seconds, 0, totalTime(doc))
  for (let index = doc.beats.length - 1; index >= 0; index--) {
    const start = beatStart(doc, index)
    if (time >= start) return {beat: doc.beats[index], index, start, local: time - start}
  }
  throw new Error('A composition requires a beat.')
}
export function transitionSpan(beat: Beat, next: Beat) {
  return overlap(beat, next) || Math.min(0.9, beat.duration * 0.35, next.duration * 0.5)
}
export const readingSeconds = (beat: Beat) => beat.text.trim() ? Math.max(1, beat.text.trim().split(/\s+/u).length / 3.3) : 0

export function revealAlpha(beat: Beat, local: number, unit: number, count: number, legacyWindow: number) {
  const duration = beat.timing?.revealDuration
  if (duration === undefined) {
    return unit === 0 ? 1 : smooth((local - legacyWindow * unit / Math.max(1, count)) / Math.min(0.24, legacyWindow / Math.max(1, count)))
  }
  if (local >= duration) return 1
  if (count <= 1) return smooth(local / duration)
  const entrance = Math.min(0.24, duration / count)
  const start = (duration - entrance) * unit / (count - 1)
  return smooth((local - start) / entrance)
}
export function revealHold(beat: Beat, next?: Beat, previous?: Beat) {
  const end = beat.duration - (next ? transitionSpan(beat, next) : 0)
  const incoming = previous ? overlap(previous, beat) : 0
  return Math.max(0, end - Math.max(beat.timing?.revealDuration ?? 0, incoming))
}
export function transitionPreviewRange(doc: Document, index: number) {
  const beat = doc.beats[index]
  const next = doc.beats[index + 1]
  const end = beatStart(doc, index) + beat.duration
  if (!next) return {start: end, finish: end}
  const span = transitionSpan(beat, next)
  return {
    start: end - span - Math.min(0.55, beat.duration - span),
    finish: end + Math.min(0.7, next.duration - overlap(beat, next)) * 0.8,
  }
}
