import {coolColors, linkedAnchors, themes, wordAccents, type Beat, type Document, type Emphasis, type Theme} from './model'
import {createLayout, font, WIDTH, lab, reel, type Glyph, type Layout, type Surface} from './layout'
import {pose} from './motion'
import {drawBackground, drawGraphics, typographyPose} from './scene-render'
import {beatStart, clamp, locate, overlap, readingSeconds, smooth, transitionSpan} from './timeline'

const reelLayouts = new WeakMap<Beat, Layout>()
const labLayouts = new WeakMap<Beat, Layout>()
const layoutSources = new WeakMap<Beat['typography'], {beat: Beat; layout: Layout; surface: Surface}>()
function layoutFor(ctx: CanvasRenderingContext2D, beat: Beat, surface: Surface) {
  const layouts = surface === lab ? labLayouts : reelLayouts
  const cached = layouts.get(beat)
  if (cached) return cached
  const source = layoutSources.get(beat.typography)
  const previous = source?.beat
  const layout = source?.surface === surface && previous?.text === beat.text &&
    previous.emphasis === beat.emphasis && previous.wordStyles === beat.wordStyles && previous.placement === beat.placement
    ? source.layout : createLayout(ctx, beat, surface)
  layoutSources.set(beat.typography, {beat, layout, surface})
  layouts.set(beat, layout)
  return layout
}
function drawGlyph(ctx: CanvasRenderingContext2D, beat: Beat, size: number, glyph: Glyph, color: string, alpha: number, x = glyph.x, y = glyph.y, angle = 0, marker?: string, markerAlpha = alpha) {
  if (alpha <= 0 && (!marker || markerAlpha <= 0)) return
  ctx.save()
  ctx.globalAlpha = clamp(alpha)
  ctx.fillStyle = color
  ctx.font = font(beat, size, glyph.weight, glyph.style?.italic)
  ctx.translate(x, y)
  if (angle) ctx.rotate(angle)
  if (marker) {
    ctx.globalAlpha = clamp(markerAlpha) * 0.19
    ctx.fillStyle = marker
    ctx.fillRect(0, -size * 0.77, glyph.width, size * 0.94)
    ctx.globalAlpha = clamp(alpha)
    ctx.fillStyle = color
  }
  if (glyph.text) ctx.fillText(glyph.text, glyph.inset ?? 0, 0)
  ctx.restore()
}
function styledColor(glyph: Glyph, theme: Theme, fallback: string) {
  if (glyph.style?.color === 'Cool') return coolColors[theme]
  if (glyph.style?.color === 'Accent' || (glyph.style?.marker && fallback === themes[theme][2])) return wordAccents[theme]
  if (glyph.style?.color === 'Ink') return themes[theme][1]
  return fallback
}
function drawBeat(ctx: CanvasRenderingContext2D, doc: Document, beat: Beat, layout: Layout, local: number, opacity: number, offset: number, surface: Surface, omit?: Emphasis, treatment = typographyPose(beat, layout, local, surface)) {
  const [, ink, accent] = themes[doc.theme]
  const marked = beat.emphasis.length > 0
  const focusCount = marked ? beat.emphasis.length : layout.phrases
  const focusPosition = clamp(local / beat.duration) * focusCount
  const revealCount = beat.reveal === 'Words' ? layout.words : beat.reveal === 'Lines' ? layout.lines : layout.phrases
  const revealWindow = Math.max(0.1, beat.duration - Math.min(readingSeconds(beat) * 0.65, beat.duration * 0.45))
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, surface.top, WIDTH, surface.bottom - surface.top)
  ctx.clip()
  if (treatment.scale !== 1 || treatment.dx || treatment.dy) {
    ctx.translate(treatment.dx, treatment.dy)
    ctx.scale(treatment.scale, treatment.scale)
  }
  // Paint markers before text so animated fragments cannot cover neighboring letters.
  const lettering: Parameters<typeof drawGlyph>[] | undefined = layout.hasMarker ? [] : undefined
  const drawText = (...args: Parameters<typeof drawGlyph>) => {
    if (lettering) lettering.push(args)
    else drawGlyph(...args)
  }
  let textIndex = -1
  for (const glyph of layout.glyphs) {
    if (glyph.text) textIndex++
    const index = textIndex
    if (glyph.mark === omit && omit) continue
    let alpha = opacity * (glyph.mark?.role === 'Subtle' ? 0.72 : 1)
    let color = glyph.mark && glyph.mark.role !== 'Subtle' ? accent : ink
    let x = glyph.x
    let y = glyph.y + offset / treatment.scale
    let angle = 0
    let markerAlpha: number | undefined
    if (beat.mode === 'Focus') {
      const group = marked ? beat.emphasis.indexOf(glyph.mark!) : glyph.phrase
      const enter = group === 0 ? 1 : smooth((focusPosition - group + 0.14) / 0.28)
      const exit = group === focusCount - 1 ? 1 : smooth((group + 1.14 - focusPosition) / 0.28)
      const focus = group < 0 ? 0 : enter * exit
      drawText(ctx, beat, layout.size, glyph, styledColor(glyph, doc.theme, ink), opacity * 0.45 * (1 - focus), x, y)
      markerAlpha = opacity * (0.45 + 0.55 * focus)
      alpha = opacity * focus
      color = accent
    }
    if (beat.mode === 'Reveal') {
      const unit = beat.reveal === 'Words' ? glyph.word : beat.reveal === 'Lines' ? glyph.line : glyph.phrase
      alpha *= unit === 0 ? 1 : smooth((local - revealWindow * unit / Math.max(1, revealCount)) / Math.min(0.24, revealWindow / Math.max(1, revealCount)))
    }
    if (beat.mode === 'Transform') {
      const motion = pose(beat, local, doc.seed, glyph.word)
      x += motion.x * surface.unit * treatment.wordMotion
      y += motion.y * surface.unit * treatment.wordMotion
      angle = motion.angle * treatment.wordMotion
      alpha *= treatment.wordMotion === 1 ? motion.alpha : 1 - (1 - motion.alpha) * treatment.wordMotion
      for (let layer = 3; layer > 0 && motion.echo > 0; layer--) {
        drawText(ctx, beat, layout.size, glyph, styledColor(glyph, doc.theme, accent), alpha * motion.echo * treatment.wordMotion * (4 - layer) * 0.13,
          x + layer * (8 + 12 * motion.echo) * surface.unit, y + layer * (12 + 18 * motion.echo) * surface.unit + Math.sin(index), angle)
      }
    }
    if (glyph.style?.marker) drawGlyph(ctx, beat, layout.size, {...glyph, text: ''}, color, 0, x, y, angle, accent, markerAlpha ?? alpha)
    drawText(ctx, beat, layout.size, glyph, styledColor(glyph, doc.theme, color), alpha, x, y, angle)
  }
  lettering?.forEach(args => drawGlyph(...args))
  ctx.restore()
}
function anchorRun(layout: Layout, mark: Emphasis) {
  return layout.glyphs.filter(glyph => glyph.mark?.id === mark.id)
}
function drawReelChrome(ctx: CanvasRenderingContext2D, doc: Document, beat: Beat, index: number) {
  const [, ink, accent] = themes[doc.theme]
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
}
function drawTransition(ctx: CanvasRenderingContext2D, doc: Document, beat: Beat, next: Beat,
  local: number, incomingTime: number, progress: number, surface: Surface, chrome: () => void) {
  const [, , accent] = themes[doc.theme]
  const layout = layoutFor(ctx, beat, surface)
  const incoming = layoutFor(ctx, next, surface)
  const links = beat.transition.type === 'Persist' ? linkedAnchors(beat, next) : undefined
  const left = links && anchorRun(layout, links[0])
  const right = links && anchorRun(incoming, links[1])
  const singleLine = (run: Glyph[]) => !!run.length && run.every(g => g.line === run[0].line)
  const canPersist = left?.length && right?.length && left && right
  const needsRuns = canPersist && (!singleLine(left) || !singleLine(right) ||
    left.some(piece => piece.style) || right.some(piece => piece.style))
  const drift = beat.transition.type === 'Transform' ? 145 * surface.unit : 0
  const stagger = canPersist || overlap(beat, next) > 0
  const outgoingOpacity = stagger ? 1 - smooth(progress / 0.66) : 1 - progress
  const incomingOpacity = stagger ? smooth((progress - 0.34) / 0.66) : progress
  drawBackground(ctx, beat, doc.theme, doc.seed, local, surface, 1 - progress)
  drawBackground(ctx, next, doc.theme, doc.seed, incomingTime, surface, progress)
  drawGraphics(ctx, beat, doc.theme, doc.seed, local, surface, 1 - progress)
  drawGraphics(ctx, next, doc.theme, doc.seed, incomingTime, surface, progress)
  chrome()
  const outgoingType = typographyPose(beat, layout, local, surface)
  const incomingType = typographyPose(next, incoming, incomingTime, surface)
  drawBeat(ctx, doc, beat, layout, local, outgoingOpacity, -drift * progress, surface, canPersist ? links[0] : undefined, outgoingType)
  drawBeat(ctx, doc, next, incoming, incomingTime, incomingOpacity, drift * (1 - progress), surface, canPersist ? links[1] : undefined, incomingType)
  if (canPersist) {
    const a = left[0]
    const b = right[0]
    const out = beat.mode === 'Transform' ? pose(beat, local, doc.seed, a.word) : {x: 0, y: 0, angle: 0}
    const incomingPose = next.mode === 'Transform' ? pose(next, incomingTime, doc.seed, b.word) : {x: 0, y: 0, angle: 0}
    const aX = outgoingType.dx + (a.x + out.x * surface.unit * outgoingType.wordMotion) * outgoingType.scale
    const bX = incomingType.dx + (b.x + incomingPose.x * surface.unit * incomingType.wordMotion) * incomingType.scale
    const aY = outgoingType.dy + (a.y + out.y * surface.unit * outgoingType.wordMotion) * outgoingType.scale
    const bY = incomingType.dy + (b.y + incomingPose.y * surface.unit * incomingType.wordMotion) * incomingType.scale
    const x = aX * (1 - progress) + bX * progress
    const y = aY * (1 - progress) + bY * progress
    const angle = out.angle * outgoingType.wordMotion * (1 - progress) + incomingPose.angle * incomingType.wordMotion * progress
    const fromSize = layout.size * outgoingType.scale
    const size = fromSize + (incoming.size * incomingType.scale - fromSize) * progress
    const mark = links[0]
    const glyph = {...a, text: beat.text.slice(mark.start, mark.end), weight: Math.round(a.weight + (b.weight - a.weight) * progress)}
    if (needsRuns) {
      const drawRun = (run: Glyph[], source: Beat, sourceSize: number, alpha: number) => {
        for (const piece of run) {
          const scale = size / sourceSize
          const dx = (piece.x - run[0].x) * scale
          const dy = (piece.y - run[0].y) * scale
          drawGlyph(ctx, source, size, {...piece, width: piece.width * scale, inset: (piece.inset ?? 0) * scale},
            styledColor(piece, doc.theme, accent), alpha,
            x + Math.cos(angle) * dx - Math.sin(angle) * dy, y + Math.sin(angle) * dx + Math.cos(angle) * dy,
            angle, piece.style?.marker ? accent : undefined)
        }
      }
      drawRun(left, beat, layout.size, 1 - progress)
      drawRun(right, next, incoming.size, progress)
    } else if (beat.typography.font === next.typography.font) drawGlyph(ctx, beat, size, glyph, accent, 1, x, y, angle)
    else {
      drawGlyph(ctx, beat, size, glyph, accent, 1 - progress, x, y, angle)
      drawGlyph(ctx, next, size, glyph, accent, progress, x, y, angle)
    }
  }
}

function drawSequence(ctx: CanvasRenderingContext2D, doc: Document, seconds: number, surface: Surface) {
  const {beat, index, local} = locate(doc, seconds)
  const chrome = () => {if (surface === reel) drawReelChrome(ctx, doc, beat, index)}
  ctx.fillStyle = themes[doc.theme][0]
  ctx.fillRect(0, 0, WIDTH, surface.height)
  const layout = layoutFor(ctx, beat, surface)
  const previous = doc.beats[index - 1]
  const next = doc.beats[index + 1]
  const incomingOverlap = previous ? overlap(previous, beat) : 0
  if (previous && local < incomingOverlap) {
    const outgoingTime = previous.duration - incomingOverlap + local
    drawTransition(ctx, doc, previous, beat, outgoingTime, local, smooth(local / incomingOverlap), surface, chrome)
  } else if (next && !overlap(beat, next) && local > beat.duration - transitionSpan(beat, next)) {
    const span = transitionSpan(beat, next)
    drawTransition(ctx, doc, beat, next, local, 0, smooth((local - beat.duration + span) / span), surface, chrome)
  } else {
    drawBackground(ctx, beat, doc.theme, doc.seed, local, surface, 1)
    drawGraphics(ctx, beat, doc.theme, doc.seed, local, surface, 1)
    chrome()
    drawBeat(ctx, doc, beat, layout, local, 1, 0, surface)
  }
  return {clipped: layout.clipped}
}

export function renderFrame(ctx: CanvasRenderingContext2D, doc: Document, seconds: number) {
  return drawSequence(ctx, doc, seconds, reel)
}

export function renderLabFrame(ctx: CanvasRenderingContext2D, doc: Document, index: number, phase: number, transition: boolean) {
  const beat = doc.beats[index]
  const next = doc.beats[index + 1]
  if (transition && next) {
    const end = beatStart(doc, index) + beat.duration
    const span = transitionSpan(beat, next)
    const start = end - span - Math.min(0.55, beat.duration - span)
    const finish = end + Math.min(0.7, next.duration - overlap(beat, next)) * 0.8
    drawSequence(ctx, doc, start + (finish - start) * phase, lab)
  } else {
    const time = phase * beat.duration
    ctx.fillStyle = themes[doc.theme][0]
    ctx.fillRect(0, 0, WIDTH, lab.height)
    drawBackground(ctx, beat, doc.theme, doc.seed, time, lab, 1)
    drawGraphics(ctx, beat, doc.theme, doc.seed, time, lab, 1)
    drawBeat(ctx, doc, beat, layoutFor(ctx, beat, lab), time, 1, 0, lab)
  }
}
