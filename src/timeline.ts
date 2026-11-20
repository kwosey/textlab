import type { Beat, Document } from './model'
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))
export const smooth = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p) }
export const totalTime = (doc: Document) => doc.beats.reduce((sum, beat) => sum + beat.duration, 0)
export const beatStart = (doc: Document, index: number) => doc.beats.slice(0, index).reduce((sum, beat) => sum + beat.duration, 0)
export function locate(doc: Document, seconds: number) {
  const time = clamp(seconds, 0, totalTime(doc))
  let start = 0
  for (const [index, beat] of doc.beats.entries()) {
    if (time < start + beat.duration || index === doc.beats.length - 1) return {beat, index, start, local: time - start}
    start += beat.duration
  }
  throw new Error('A composition requires a beat.')
}
export const readingSeconds = (beat: Beat) => beat.text.trim() ? Math.max(1, beat.text.trim().split(/\s+/u).length / 3.3) : 0
