import {coolColors, linkedAnchors, themes, wordAccents, type Beat, type Document, type Emphasis, type Theme} from './model'
import {createLayout, font, WIDTH, lab, reel, type Glyph, type Layout, type Surface} from './layout'
import {pose} from './motion'
import {drawBackground, drawGraphics, typographyPose} from './scene-render'
import {clamp, locate, overlap, readingSeconds, revealAlpha, smooth, transitionPreviewRange, transitionSpan} from './timeline'

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
type AnchorPaint = {only?: Emphasis; held?: Emphasis; revealFloor?: number}

function drawBeat(ctx: CanvasRenderingContext2D, doc: Document, beat: Beat, layout: Layout, local: number, opacity: number, offset: number, surface: Surface, omit?: Emphasis, treatment = typographyPose(beat, layout, local, surface), anchor?: AnchorPaint) {
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
    if ((omit && glyph.mark === omit) || (anchor?.only && glyph.mark !== anchor.only)) continue
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
      const carried = anchor?.held && glyph.mark === anchor.held ? anchor.revealFloor ?? 1 : 0
      alpha *= Math.max(carried, revealAlpha(beat, local, unit, revealCount, revealWindow))
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
const mix = (a: number, b: number, progress: number) => a + (b - a) * progress
type TypePose = ReturnType<typeof typographyPose>

function anchorBounds(beat: Beat, layout: Layout, run: Glyph[], time: number, seed: number, surface: Surface, type: TypePose) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (const glyph of run) {
    const motion = beat.mode === 'Transform' ? pose(beat, time, seed, glyph.word) : null
    const x = type.dx + (glyph.x + (motion?.x ?? 0) * surface.unit * type.wordMotion) * type.scale
    const y = type.dy + (glyph.y + (motion?.y ?? 0) * surface.unit * type.wordMotion) * type.scale
    left = Math.min(left, x)
    right = Math.max(right, x + glyph.width * type.scale)
    top = Math.min(top, y - layout.size * type.scale)
    bottom = Math.max(bottom, y + layout.size * type.scale * 0.25)
  }
  return {left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top)}
}

function receivedAnchor(previous: Beat | undefined, beat: Beat) {
  return previous?.transition.type === 'Persist' ? linkedAnchors(previous, beat)?.[1] : undefined
}

function drawTransition(ctx: CanvasRenderingContext2D, doc: Document, beat: Beat, next: Beat,
  local: number, incomingTime: number, progress: number, surface: Surface, chrome: () => void, held?: Emphasis) {
  const [, , accent] = themes[doc.theme]
  const layout = layoutFor(ctx, beat, surface)
  const incoming = layoutFor(ctx, next, surface)
  const links = beat.transition.type === 'Persist' ? linkedAnchors(beat, next) : undefined
  const left = links && anchorRun(layout, links[0])
  const right = links && anchorRun(incoming, links[1])
  const canPersist = links && left?.length && right?.length
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
  drawBeat(ctx, doc, beat, layout, local, outgoingOpacity, -drift * progress, surface, canPersist ? links[0] : undefined, outgoingType, {held})
  drawBeat(ctx, doc, next, incoming, incomingTime, incomingOpacity, drift * (1 - progress), surface, canPersist ? links[1] : undefined, incomingType)
  if (!links || !left?.length || !right?.length) return

  const a = left[0]
  const b = right[0]
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, surface.top, WIDTH, surface.bottom - surface.top)
  ctx.clip()
  if (left.length === 1 && right.length === 1 && a.text === b.text && !a.style && !b.style &&
      a.weight === b.weight && beat.typography.font === next.typography.font &&
      beat.mode === 'Transform' && next.mode === 'Transform' && beat.effect !== 'Scatter' && next.effect !== 'Scatter') {
    // Identical lettering can travel as one native glyph run, including the original Tide handoff.
    const out = pose(beat, local, doc.seed, a.word)
    const into = pose(next, incomingTime, doc.seed, b.word)
    const aY = outgoingType.dy + (a.y + out.y * surface.unit * outgoingType.wordMotion) * outgoingType.scale
    const bY = incomingType.dy + (b.y + into.y * surface.unit * incomingType.wordMotion) * incomingType.scale
    const x = (outgoingType.dx + a.x * outgoingType.scale) * (1 - progress) + (incomingType.dx + b.x * incomingType.scale) * progress
    const y = aY * (1 - progress) + bY * progress
    const angle = out.angle * outgoingType.wordMotion * (1 - progress) + into.angle * incomingType.wordMotion * progress
    const fromSize = layout.size * outgoingType.scale
    const size = mix(fromSize, incoming.size * incomingType.scale, progress)
    const echo = out.echo * (1 - progress) + into.echo * progress
    const echoOpacity = out.echo * outgoingType.wordMotion * (1 - progress) + into.echo * incomingType.wordMotion * progress
    for (let layer = 3; layer > 0 && echoOpacity > 0; layer--) {
      drawGlyph(ctx, beat, size, a, accent, echoOpacity * (4 - layer) * 0.13,
        x + layer * (8 + 12 * echo) * surface.unit,
        y + layer * (12 + 18 * echo) * surface.unit, angle)
    }
    drawGlyph(ctx, beat, size, a, accent, 1, x, y, angle)
  } else {
    // Place both native layouts in one moving footprint. Complementary clips reveal the
    // incoming style across the word without two overlapping copies or an opacity trough.
    const from = anchorBounds(beat, layout, left, local, doc.seed, surface, outgoingType)
    const to = anchorBounds(next, incoming, right, incomingTime, doc.seed, surface, incomingType)
    const x = mix(from.left, to.left, progress)
    const y = mix(from.top, to.top, progress)
    const width = mix(from.width, to.width, progress)
    const height = mix(from.height, to.height, progress)
    const guard = height * 0.42
    const edge = clamp(x - guard + (width + guard * 2) * progress, 0, WIDTH)
    const split = progress < 0.08 ? edge * smooth(progress / 0.08)
      : progress > 0.92 ? mix(edge, WIDTH, smooth((progress - 0.92) / 0.08)) : edge
    const parts = [
      {beat, layout, time: local, box: from, treatment: outgoingType, mark: links[0], fromX: split, toX: WIDTH,
        floor: held === links[0] ? 1 : smooth(progress * 3)},
      {beat: next, layout: incoming, time: incomingTime, box: to, treatment: incomingType, mark: links[1], fromX: 0, toX: split, floor: 1},
    ]
    for (const part of parts) {
      if (part.toX <= part.fromX || (part.beat === beat && progress === 1) || (part.beat === next && progress === 0)) continue
      ctx.save()
      ctx.beginPath()
      ctx.rect(part.fromX, surface.top, part.toX - part.fromX, surface.bottom - surface.top)
      ctx.clip()
      ctx.translate(x, y)
      ctx.scale(width / part.box.width, height / part.box.height)
      ctx.translate(-part.box.left, -part.box.top)
      drawBeat(ctx, doc, part.beat, part.layout, part.time, 1, 0, surface,
        undefined, part.treatment, {only: part.mark, held: part.mark, revealFloor: part.floor})
      ctx.restore()
    }
  }
  ctx.restore()

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
    drawTransition(ctx, doc, previous, beat, outgoingTime, local, smooth(local / incomingOverlap), surface, chrome, receivedAnchor(doc.beats[index - 2], previous))
  } else if (next && !overlap(beat, next) && local > beat.duration - transitionSpan(beat, next)) {
    const span = transitionSpan(beat, next)
    drawTransition(ctx, doc, beat, next, local, 0, smooth((local - beat.duration + span) / span), surface, chrome, receivedAnchor(previous, beat))
  } else {
    drawBackground(ctx, beat, doc.theme, doc.seed, local, surface, 1)
    drawGraphics(ctx, beat, doc.theme, doc.seed, local, surface, 1)
    chrome()
    drawBeat(ctx, doc, beat, layout, local, 1, 0, surface, undefined, undefined, {held: receivedAnchor(previous, beat)})
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
    const {start, finish} = transitionPreviewRange(doc, index)
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
