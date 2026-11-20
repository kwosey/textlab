import {linkedAnchors, themes, type Beat, type Document, type Emphasis} from './model'
import {createLayout, font, HEIGHT, WIDTH, type Glyph, type Layout} from './layout'
import {pose} from './motion'
import {clamp, locate, readingSeconds, smooth} from './timeline'

const layouts = new WeakMap<Beat, Layout>()
function layoutFor(ctx: CanvasRenderingContext2D, beat: Beat) {
  const cached = layouts.get(beat)
  if (cached) return cached
  const layout = createLayout(ctx, beat)
  layouts.set(beat, layout)
  return layout
}
function drawGlyph(ctx: CanvasRenderingContext2D, beat: Beat, size: number, glyph: Glyph, color: string, alpha: number, x = glyph.x, y = glyph.y, angle = 0) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = clamp(alpha)
  ctx.fillStyle = color
  ctx.font = font(beat, size, glyph.weight)
  ctx.translate(x, y)
  if (angle) ctx.rotate(angle)
  ctx.fillText(glyph.text, 0, 0)
  ctx.restore()
}
function drawBeat(ctx: CanvasRenderingContext2D, doc: Document, beat: Beat, layout: Layout, local: number, opacity: number, offset: number, omit?: Emphasis) {
  const [, ink, accent] = themes[doc.theme]
  const marked = beat.emphasis.length > 0
  const focusCount = marked ? beat.emphasis.length : layout.phrases
  const focusPosition = clamp(local / beat.duration) * focusCount
  const revealCount = beat.reveal === 'Words' ? layout.words : beat.reveal === 'Lines' ? layout.lines : layout.phrases
  const revealWindow = Math.max(0.1, beat.duration - Math.min(readingSeconds(beat) * 0.65, beat.duration * 0.45))
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 220, WIDTH, 1470)
  ctx.clip()
  for (const [index, glyph] of layout.glyphs.entries()) {
    if (glyph.mark === omit && omit) continue
    let alpha = opacity * (glyph.mark?.role === 'Subtle' ? 0.72 : 1)
    let color = glyph.mark && glyph.mark.role !== 'Subtle' ? accent : ink
    let x = glyph.x
    let y = glyph.y + offset
    let angle = 0
    if (beat.mode === 'Focus') {
      const group = marked ? beat.emphasis.indexOf(glyph.mark!) : glyph.phrase
      const enter = group === 0 ? 1 : smooth((focusPosition - group + 0.14) / 0.28)
      const exit = group === focusCount - 1 ? 1 : smooth((group + 1.14 - focusPosition) / 0.28)
      const focus = group < 0 ? 0 : enter * exit
      drawGlyph(ctx, beat, layout.size, glyph, ink, opacity * 0.45 * (1 - focus), x, y)
      alpha = opacity * focus
      color = accent
    }
    if (beat.mode === 'Reveal') {
      const unit = beat.reveal === 'Words' ? glyph.word : beat.reveal === 'Lines' ? glyph.line : glyph.phrase
      alpha *= unit === 0 ? 1 : smooth((local - revealWindow * unit / Math.max(1, revealCount)) / Math.min(0.24, revealWindow / Math.max(1, revealCount)))
    }
    if (beat.mode === 'Transform') {
      const motion = pose(beat, local, doc.seed, glyph.word)
      x += motion.x
      y += motion.y
      angle = motion.angle
      alpha *= motion.alpha
      for (let layer = 3; layer > 0 && motion.echo > 0; layer--) {
        drawGlyph(ctx, beat, layout.size, glyph, accent, alpha * motion.echo * (4 - layer) * 0.13,
          x + layer * (8 + 12 * motion.echo), y + layer * (12 + 18 * motion.echo) + Math.sin(index), angle)
      }
    }
    drawGlyph(ctx, beat, layout.size, glyph, color, alpha, x, y, angle)
  }
  ctx.restore()
}
function anchorRun(layout: Layout, mark: Emphasis) {
  return layout.glyphs.filter(glyph => glyph.mark?.id === mark.id)
}
export function renderFrame(ctx: CanvasRenderingContext2D, doc: Document, seconds: number) {
  const {beat, index, local} = locate(doc, seconds)
  const [paper, ink, accent] = themes[doc.theme]
  const layout = layoutFor(ctx, beat)
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = accent
  ctx.fillRect(88, 123, 34, 4)
  ctx.font = '500 31px monospace'
  ctx.fillText('TEXT LAB / ' + doc.title.toUpperCase().slice(0, 35), 143, 134, 849)
  ctx.globalAlpha = 0.25
  ctx.fillStyle = ink
  ctx.fillRect(88, 175, 904, 1.5)
  ctx.fillRect(88, 1744, 904, 1.5)
  ctx.globalAlpha = 1
  ctx.fillStyle = accent
  ctx.font = '500 31px monospace'
  ctx.fillText(String(index + 1).padStart(2, '0') + ' / ' + String(doc.beats.length).padStart(2, '0'), 88, 1814)
  ctx.textAlign = 'right'
  ctx.fillText(beat.mode.toUpperCase(), 992, 1814)
  ctx.textAlign = 'left'

  const next = doc.beats[index + 1]
  const span = Math.min(0.9, beat.duration * 0.35, (next?.duration ?? 1) * 0.5)
  const progress = smooth((local - beat.duration + span) / span)
  if (next && progress > 0) {
    const incoming = layoutFor(ctx, next)
    const links = beat.transition.type === 'Persist' ? linkedAnchors(beat, next) : undefined
    const left = links && anchorRun(layout, links[0])
    const right = links && anchorRun(incoming, links[1])
    const singleLine = (run: Glyph[]) => !!run.length && run.every(g => g.line === run[0].line)
    const canPersist = left && right && singleLine(left) && singleLine(right)
    const drift = beat.transition.type === 'Transform' ? 145 : 0
    const outgoingOpacity = canPersist ? 1 - smooth(progress / 0.66) : 1 - progress
    const incomingOpacity = canPersist ? smooth((progress - 0.34) / 0.66) : progress
    drawBeat(ctx, doc, beat, layout, local, outgoingOpacity, -drift * progress, canPersist ? links[0] : undefined)
    drawBeat(ctx, doc, next, incoming, 0, incomingOpacity, drift * (1 - progress), canPersist ? links[1] : undefined)
    if (canPersist) {
      const a = left[0]
      const b = right[0]
      const out = beat.mode === 'Transform' ? pose(beat, local, doc.seed, a.word) : {x: 0, y: 0, angle: 0}
      const incomingPose = next.mode === 'Transform' ? pose(next, 0, doc.seed, b.word) : {x: 0, y: 0, angle: 0}
      const x = (a.x + out.x) * (1 - progress) + (b.x + incomingPose.x) * progress
      const y = (a.y + out.y) * (1 - progress) + (b.y + incomingPose.y) * progress
      const angle = out.angle * (1 - progress) + incomingPose.angle * progress
      const size = layout.size + (incoming.size - layout.size) * progress
      const mark = links[0]
      const glyph = {...a, text: beat.text.slice(mark.start, mark.end), weight: Math.round(a.weight + (b.weight - a.weight) * progress)}
      if (beat.typography.font === next.typography.font) drawGlyph(ctx, beat, size, glyph, accent, 1, x, y, angle)
      else {
        drawGlyph(ctx, beat, size, glyph, accent, 1 - progress, x, y, angle)
        drawGlyph(ctx, next, size, glyph, accent, progress, x, y, angle)
      }
    }
  } else {
    drawBeat(ctx, doc, beat, layout, local, 1, 0)
  }
  return {clipped: layout.clipped, size: layout.size}
}
