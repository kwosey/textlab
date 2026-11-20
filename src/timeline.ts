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
