import {WIDTH, type Layout, type Surface} from './layout'
import {coolColors, themes, type Beat, type Theme} from './model'
import {randomAt} from './motion'
import {backgroundDefaults, graphicDefaults, typeMotionDefaults} from './scene'
import {clamp, smooth} from './timeline'

const TAU = Math.PI * 2
const grainFields = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>()
function grainField(ctx: CanvasRenderingContext2D, seed: number, step: number, color: string) {
  let cache = grainFields.get(ctx)
  if (!cache) {
    cache = new Map()
    grainFields.set(ctx, cache)
  }
  const key = `${seed}:${step}:${color}`
  const cached = cache.get(key)
  if (cached) return cached
  const cells = 17
  const tile = ctx.canvas.ownerDocument.createElement('canvas')
  tile.width = tile.height = cells * step
  const brush = tile.getContext('2d')!
  brush.fillStyle = color
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const index = row * cells + col
      const jitter = randomAt(seed, index)
      if (jitter < 0.55) continue
      const size = 1.5 + jitter * 1.8
      const x = col * step + jitter * (step - size)
      const y = row * step + randomAt(seed, index + 491) * (step - size)
      brush.fillRect(x, y, size, size)
    }
  }
  const pattern = ctx.createPattern(tile, 'repeat')!
  if (cache.size >= 12) cache.delete(cache.keys().next().value!)
  cache.set(key, pattern)
  return pattern
}
const toneColor = (theme: Theme, tone: 'Accent' | 'Cool' | 'Ink') =>
  tone === 'Cool' ? coolColors[theme] : themes[theme][tone === 'Ink' ? 1 : 2]
const typeAmount = (beat: Beat) => {
  const motion = beat.scene?.typeMotion
  return motion && motion.kind !== 'Off' ? (motion.amount ?? typeMotionDefaults.amount) / 100 : 0
}
const calm = (beat: Beat) => 1 - 0.35 * typeAmount(beat)
const rgba = (color: string, alpha: number) => color + Math.round(clamp(alpha) * 255).toString(16).padStart(2, '0')

function veil(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number, height: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, rgba(color, alpha))
  gradient.addColorStop(0.55, rgba(color, alpha * 0.55))
  gradient.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, height)
}

// Each layer uses a bounded number of paths and reads only the input frame time.
export function drawBackground(ctx: CanvasRenderingContext2D, beat: Beat, theme: Theme, seed: number, time: number, surface: Surface, opacity: number) {
  const background = beat.scene?.background
  if (!background || background.kind === 'Off' || opacity <= 0) return
  const strength = (background.intensity ?? backgroundDefaults.intensity) / 100 * opacity * calm(beat)
  if (strength <= 0) return
  const size = (background.scale ?? backgroundDefaults.scale) / 100
  const phase = time * (background.speed ?? backgroundDefaults.speed) * 1.35 + randomAt(seed, 811) * TAU
  const height = surface.height
  const warm = toneColor(theme, 'Accent')
  const cool = toneColor(theme, 'Cool')
  ctx.save()
  if (background.kind === 'Gradient Drift') {
    const radius = Math.hypot(WIDTH, height) * size * 0.66
    veil(ctx, WIDTH * (0.24 + 0.17 * Math.cos(phase)), height * (0.2 + 0.13 * Math.sin(phase)), radius, warm, strength * 0.19, height)
    veil(ctx, WIDTH * (0.83 + 0.12 * Math.sin(phase * 0.78)), height * (0.76 + 0.13 * Math.cos(phase)), radius * 0.92, cool, strength * 0.24, height)
  } else if (background.kind === 'Flow') {
    veil(ctx, WIDTH * 0.8, height * 0.72, Math.hypot(WIDTH, height) * 0.53 * size, cool, strength * 0.13, height)
    ctx.lineWidth = Math.max(1.5, 3.1 * surface.unit)
    for (let i = 0; i < 12; i++) {
      const base = height * (0.53 + i * 0.05)
      const wave = height * 0.105 * size
      ctx.strokeStyle = rgba(i < 4 ? warm : cool, strength * (i % 3 === 0 ? 0.33 : 0.18))
      ctx.beginPath()
      for (let x = -40; x <= WIDTH + 40; x += 28) {
        const y = base + wave * Math.sin(x / (180 * size) + phase + i * 0.26)
        if (x === -40) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  } else {
    // A coarse, low-contrast moving grain field. Seeding is independent of draw order.
    const step = Math.round(21 * size)
    const shiftX = Math.sin(phase) * step
    const shiftY = Math.cos(phase * 0.8) * step
    ctx.fillStyle = grainField(ctx, seed, step, toneColor(theme, 'Ink'))
    ctx.globalAlpha = strength * 0.22
    ctx.translate(shiftX, shiftY)
    ctx.fillRect(-shiftX, -shiftY, WIDTH, height)
  }
  ctx.restore()
}

export function drawGraphics(ctx: CanvasRenderingContext2D, beat: Beat, theme: Theme, seed: number, time: number, surface: Surface, opacity: number) {
  const shapes = beat.scene?.shapes
  if (!shapes?.length || opacity <= 0) return
  const area = surface.bottom - surface.top
  const phase = clamp(time / beat.duration)
  ctx.save()
  for (const [index, shape] of shapes.entries()) {
    const {kind, x, y, size, motion, tone, energy} = {...graphicDefaults, ...shape}
    const power = energy / 100 * calm(beat)
    const offset = phase * TAU + randomAt(seed, index + 165) * TAU
    const drift = motion === 'Drift' ? power : 0
    const scale = motion === 'Expand' ? 1 - power * (0.63 - 0.85 * smooth(phase * 1.65)) : 1
    const cx = x / 100 * WIDTH + Math.sin(offset) * drift * WIDTH * 0.10
    const cy = surface.top + y / 100 * area + Math.cos(offset) * drift * area * 0.10
    const length = size / 100 * WIDTH * scale * (surface.unit < 1 ? 0.78 : 1)
    const color = toneColor(theme, tone)
    ctx.strokeStyle = rgba(color, opacity * 0.61)
    ctx.fillStyle = rgba(color, opacity * 0.085)
    ctx.lineWidth = (kind === 'Line' ? 4.6 : 3.4) * surface.unit
    ctx.beginPath()
    if (kind === 'Circle') {
      ctx.arc(cx, cy, length * 0.5, 0, TAU)
      ctx.fill()
    } else if (kind === 'Rectangle') {
      const height = length * 0.58
      ctx.rect(cx - length / 2, cy - height / 2, length, height)
    } else {
      ctx.moveTo(cx - length / 2, cy)
      ctx.lineTo(cx + length / 2, cy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

type Bounds = {left: number; right: number; top: number; bottom: number}
const boundsCache = new WeakMap<Layout, Bounds>()
function boundsOf(layout: Layout) {
  const cached = boundsCache.get(layout)
  if (cached) return cached
  const bounds = {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity}
  for (const glyph of layout.glyphs) {
    bounds.left = Math.min(bounds.left, glyph.x)
    bounds.right = Math.max(bounds.right, glyph.x + glyph.width)
    bounds.top = Math.min(bounds.top, glyph.y - layout.size * 0.8)
    bounds.bottom = Math.max(bounds.bottom, glyph.y + layout.size * 0.23)
  }
  boundsCache.set(layout, bounds)
  return bounds
}

const still = {dx: 0, dy: 0, scale: 1, wordMotion: 1}
export function typographyPose(beat: Beat, layout: Layout, time: number, surface: Surface) {
  const amount = typeAmount(beat)
  if (!amount || !layout.glyphs.length) return still
  const {left, right, top, bottom} = boundsOf(layout)
  const x = (left + right) / 2
  const y = (top + bottom) / 2
  const phase = clamp(time / beat.duration)
  const kind = beat.scene?.typeMotion?.kind
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const fit = Math.max(1, Math.min((WIDTH - 66) / width, (surface.bottom - surface.top - 26) / height))
  if (kind === 'Slide') {
    // Start lower and slightly to the right, then settle into the composed placement.
    const travel = amount * (1 - smooth(phase * 2))
    return {scale: 1, dx: Math.max(0, Math.min(WIDTH * 0.16, WIDTH - right - 28)) * travel,
      dy: Math.max(0, Math.min((surface.bottom - surface.top) * 0.17, surface.bottom - bottom - 12)) * travel,
      wordMotion: 1 - amount * 0.44}
  }
  const headline = layout.words <= 4 && layout.lines <= 2 && beat.text.trim().length <= 27
  const zoom = kind === 'Oversized'
    ? Math.min(1 + amount * (headline ? 0.92 : 0.16), fit * (headline ? 1.09 : 1))
    : Math.min(1 + amount * (0.13 + 0.34 * Math.sin(Math.PI * smooth(phase * 1.35))) * (1 - smooth(phase)), fit)
  const roomX = kind === 'Oversized' && headline ? WIDTH * 1.09 : WIDTH - 38
  const roomY = surface.bottom - surface.top
  const centerX = clamp(x, Math.min(WIDTH / 2, (WIDTH - roomX + width * zoom) / 2),
    WIDTH - Math.min(WIDTH / 2, (WIDTH - roomX + width * zoom) / 2))
  const halfHeight = Math.min(roomY / 2, height * zoom / 2)
  const centerY = clamp(y, surface.top + halfHeight, surface.bottom - halfHeight)
  return {scale: zoom, dx: centerX - x * zoom, dy: centerY - y * zoom, wordMotion: 1 - amount * 0.56}
}
