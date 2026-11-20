import {segments, type Beat, type Emphasis, type WordStyle} from './model'
export const WIDTH = 1080
export const HEIGHT = 1920
export const LAB_HEIGHT = 420
export const reel = {height: HEIGHT, top: 220, bottom: 1690, fit: 1350, minBaseline: 285, unit: 1}
export const lab = {height: LAB_HEIGHT, top: 0, bottom: LAB_HEIGHT, fit: 340, minBaseline: 42, unit: 0.72}
export type Surface = typeof reel
const families = {Serif: 'Georgia, "Times New Roman", serif', Sans: 'Arial, sans-serif', Mono: '"Courier New", monospace'}
export const font = (beat: Beat, size: number, weight: number, italic?: true) =>
  `${italic ? 'italic ' : ''}${weight} ${size}px ${families[beat.typography.font]}`
type Piece = {text: string; start: number; end: number; width: number; weight: number; mark?: Emphasis; style?: WordStyle; inset?: number; word: number; phrase: number}
export type Glyph = Piece & {x: number; y: number; line: number}
export type Layout = {glyphs: Glyph[]; size: number; lines: number; words: number; phrases: number; clipped: boolean; hasMarker: boolean}

function build(ctx: CanvasRenderingContext2D, beat: Beat, size: number, surface: Surface): Layout {
  const t = beat.typography
  const limit = WIDTH * (surface === lab ? 0.88 : t.width / 100)
  let word = 0
  let phrase = 0
  const lines: Piece[][] = [[]]
  let used = 0
  let whitespace = 0
  let spaceStart = 0
  let spaceEnd = 0
  const spans = beat.wordStyles ?? []
  const cutsAt = [...beat.emphasis, ...spans].flatMap(mark => [mark.start, mark.end])
  const findStyle = (from: number, to: number) => spans.find(run => run.start <= from && run.end >= to)?.style
  const wrap = () => { lines.push([]); used = 0; whitespace = 0 }
  function metrics(text: string, weight: number, style?: WordStyle) {
    ctx.font = font(beat, size, weight, style?.italic)
    const bounds = ctx.measureText(text)
    const useInkBounds = style?.italic || style?.marker
    const inset = useInkBounds ? Math.max(0, bounds.actualBoundingBoxLeft) : 0
    const padding = style?.marker ? size * 0.035 : 0
    const width = useInkBounds ? inset + Math.max(bounds.width, bounds.actualBoundingBoxRight) : bounds.width
    return {width: width + padding * 2, inset: inset + padding}
  }
  function add(piece: Piece) {
    lines[lines.length - 1].push(piece)
    used += piece.width
  }
  for (const match of beat.text.matchAll(/\r\n|[\r\n]|[^\S\r\n]+|\S+/gu)) {
    const value = match[0]
    if (/^[\r\n]/u.test(value)) { wrap(); phrase++; continue }
    if (/^\s/u.test(value)) {
      if (used > 0) {
        spaceStart = match.index
        spaceEnd = spaceStart + value.length
        whitespace = Math.min(limit / 2, metrics(value.replaceAll('\t', '    '), t.weight).width)
      }
      continue
    }
    const graphemes = segments(value)
    const bionicEnd = t.bionic ? match.index + (graphemes[Math.ceil(graphemes.length * 0.45)]?.index ?? value.length) : -1
    const start = match.index
    const end = start + value.length
    const cuts = [...new Set([start, end, bionicEnd, ...cutsAt])]
      .filter(cut => cut >= start && cut <= end).sort((a, b) => a - b)
    const pieces = cuts.slice(0, -1).map((from, i): Piece => {
      const to = cuts[i + 1]
      const text = beat.text.slice(from, to)
      const mark = beat.emphasis.find(m => m.start <= from && m.end >= to)
      const style = findStyle(from, to)
      const inherited = mark?.role === 'Strong' || mark?.role === 'Anchor' || from < bionicEnd ? Math.max(700, t.weight) : t.weight
      const weight = style?.weight === 'Bold' ? 800 : style?.weight === 'Light' ? 300 : inherited
      return {text, start: from, end: to, ...metrics(text, weight, style), weight, mark, style, word, phrase}
    })
    const wordWidth = pieces.reduce((sum, piece) => sum + piece.width, 0)
    if (used && used + whitespace + wordWidth > limit) wrap()
    if (whitespace) {
      const style = findStyle(spaceStart, spaceEnd)
      const mark = beat.emphasis.find(m => m.start <= spaceStart && m.end >= spaceEnd)
      add({...pieces[0], text: '', start: spaceStart, end: spaceEnd, width: whitespace, style, mark})
    }
    whitespace = 0
    for (const piece of pieces) {
      if (wordWidth <= limit) { add(piece); continue }
      let chunk = ''
      let chunkStart = piece.start
      for (const {segment, index} of segments(piece.text)) {
        if (used + metrics(chunk + segment, piece.weight, piece.style).width > limit && (used || chunk)) {
          if (chunk) add({...piece, text: chunk, start: chunkStart, end: piece.start + index, ...metrics(chunk, piece.weight, piece.style)})
          wrap()
          chunk = ''
          chunkStart = piece.start + index
        }
        chunk += segment
      }
      if (chunk) add({...piece, text: chunk, start: chunkStart, ...metrics(chunk, piece.weight, piece.style)})
    }
    word++
    if (/[.!?…;:]["»”’)]*$/u.test(value)) phrase++
  }
  while (lines.length > 1 && !lines.at(-1)?.length) lines.pop()
  const step = size * t.leading
  const height = (lines.length - 1) * step + size
  const center = (surface.height - height) / 2 + size * 0.82
  const top = Math.max(surface.minBaseline, surface.top + size * 0.96)
  const bottom = Math.max(top, surface.bottom - 48 * surface.unit - (height - size))
  const position = surface === reel ? (beat.placement?.position ?? 0) / 100 : 0
  const baseline = Math.max(top, Math.min(bottom, center))
  const first = baseline + Math.abs(position) * ((position < 0 ? top : bottom) - baseline)
  const glyphs = lines.flatMap((line, index) => {
    const width = line.reduce((sum, p) => sum + p.width, 0)
    let x = (WIDTH - limit) / 2 + (t.align === 'Center' ? (limit - width) / 2 : t.align === 'Right' ? limit - width : 0)
    return line.flatMap(piece => {
      const glyph = {...piece, x, y: first + index * step, line: index}
      x += piece.width
      return piece.text || piece.style?.marker ? [glyph] : []
    })
  })
  return {glyphs, size, lines: lines.length, words: word, phrases: Math.max(0, (glyphs.at(-1)?.phrase ?? -1) + 1), clipped: height > surface.fit, hasMarker: glyphs.some(glyph => glyph.style?.marker)}
}
export function createLayout(ctx: CanvasRenderingContext2D, beat: Beat, surface: Surface) {
  const scale = surface === reel ? (beat.placement?.scale ?? 100) / 100 : 1
  const size = beat.typography.size * scale * surface.unit
  const layout = build(ctx, beat, size, surface)
  if (!layout.clipped) return layout
  let best = build(ctx, beat, Math.min(size, 30 * surface.unit), surface)
  if (best.clipped) return best
  let upper = size
  while (upper - best.size > 2) {
    const candidate = build(ctx, beat, Math.floor((upper + best.size) / 2), surface)
    if (candidate.clipped) upper = candidate.size
    else best = candidate
  }
  return best
}
