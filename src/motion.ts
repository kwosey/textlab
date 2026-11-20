import {clamp, smooth} from './timeline'
import type { Beat } from './model'
export function randomAt(seed: number, index: number) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}
export function pose(beat: Beat, time: number, seed: number, index: number) {
  const p = clamp(time / beat.duration)
  const power = beat.intensity / 100
  if (beat.effect === 'Scatter') {
    const spread = (1 - smooth((p - index % 6 * 0.022) / 0.48)) * power
    return {x: (randomAt(seed, index * 2) - 0.5) * 560 * spread,
      y: (randomAt(seed, index * 2 + 1) - 0.5) * 670 * spread,
      angle: (randomAt(seed, index + 4700) - 0.5) * spread, alpha: 1 - spread * 0.68, echo: 0}
  }
  if (beat.effect === 'Wave') {
    const wave = Math.sin(p * 2 * Math.PI - index * 0.59) * Math.sin(p * Math.PI) * power
    return {x: 0, y: wave * 84, angle: wave * 0.19, alpha: 1, echo: 0}
  }
  return {x: 0, y: 0, angle: 0, alpha: 1, echo: power * Math.sin(p * Math.PI)}
}
