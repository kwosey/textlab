import {validCues, validFraming, validImpact, type Cue, type Framing, type Impact} from './direction'
import {validScene, type Scene} from './scene'

export const modes = ['Reading', 'Focus', 'Reveal', 'Transform'] as const
export const roles = ['Strong', 'Subtle', 'Anchor'] as const
export const fonts = ['Serif', 'Sans', 'Mono'] as const
export const effects = ['Scatter', 'Echo', 'Wave'] as const
export const reveals = ['Words', 'Lines', 'Phrases'] as const
export const transitions = ['Replace', 'Persist', 'Transform'] as const
export const themes = {
  Paper: ['#f1e8d8', '#24201d', '#ad381e'],
  Night: ['#222027', '#f3e9db', '#f6a176'],
  Moss: ['#e0e5cf', '#213529', '#366545'],
  Lilac: ['#e7dff4', '#2e2442', '#7845a2'],
} as const
export type Theme = keyof typeof themes
export type Emphasis = { id: string; start: number; end: number; role: typeof roles[number] }
export type TextRange = {start: number; end: number}
export const wordColors = ['Ink', 'Accent', 'Cool'] as const
export const wordWeights = ['Light', 'Bold'] as const
export const wordAccents: Record<Theme, string> = {Paper: '#902b16', Night: '#f6a176', Moss: '#28543a', Lilac: '#653585'}
export const coolColors: Record<Theme, string> = {Paper: '#245783', Night: '#9bd6ed', Moss: '#294f7c', Lilac: '#205b64'}
export type WordStyle = {color?: typeof wordColors[number]; weight?: typeof wordWeights[number]; marker?: true; italic?: true}
export type StyledRange = TextRange & {style: WordStyle}
export type Typography = {
  font: typeof fonts[number]; size: number; weight: number; leading: number; width: number
  align: 'Left' | 'Center' | 'Right'; bionic: boolean
}
export type Placement = {position?: number; scale?: number; overlap?: number}
export type Beat = {
  id: string; text: string; duration: number; mode: typeof modes[number]
  typography: Typography; emphasis: Emphasis[]; effect: typeof effects[number]
  reveal: typeof reveals[number]; intensity: number
  placement?: Placement
  scene?: Scene
  framing?: Framing
  impact?: Impact
  cues?: Cue[]
  timing?: {revealDuration: number}
  wordStyles?: StyledRange[]
  transition: { type: typeof transitions[number]; from?: string; to?: string; broken?: true }
}
export type Document = { documentVersion: 1; title: string; originalText: string; theme: Theme; seed: number; beats: Beat[]; safeArea?: boolean }
export const newId = () => crypto.randomUUID()
export const makeBeat = (text: string, props: Partial<Beat> = {}): Beat => ({
  id: newId(), text, duration: 6, mode: 'Reading',
  typography: {font: 'Serif', size: 96, weight: 500, leading: 1.08, width: 82, align: 'Left', bionic: false},
  emphasis: [], effect: 'Scatter', reveal: 'Words', intensity: 55, transition: {type: 'Replace'}, ...props,
})
const graphemes = new Intl.Segmenter(undefined, {granularity: 'grapheme'})
export const segments = (value: string) => [...graphemes.segment(value)]
export function boundaries(value: string) {
  return new Set([...segments(value).map(part => part.index), value.length])
}
export function editText(beat: Beat, value: string, caret?: number): Beat {
  const old = segments(beat.text)
  const next = segments(value)
  const position = caret === undefined ? -1 : caret === value.length ? next.length : next.findIndex(part => part.index === caret)
  const tail = position < 0 ? -1 : next.length - position
  const matchesTail = tail >= 0 && tail <= old.length &&
    old.slice(old.length - tail).every((part, i) => part.segment === next[position + i].segment)
  let prefix = 0
  let suffix = matchesTail ? tail : 0
  while (prefix < Math.min(old.length, next.length) - suffix && old[prefix].segment === next[prefix].segment) prefix++
  if (!matchesTail || tail === 0) {
    while (suffix < Math.min(old.length, next.length) - prefix &&
      old[old.length - 1 - suffix].segment === next[next.length - 1 - suffix].segment) suffix++
  }
  const left = old[prefix]?.index ?? beat.text.length
  const right = old[old.length - suffix]?.index ?? beat.text.length
  const shift = value.length - beat.text.length
  // A changed passage loses its range. Intact suffixes keep their original words.
  function rebase<T extends TextRange>(ranges: T[]) {
    return ranges.flatMap(mark => {
      if (mark.end <= left) return [mark]
      if (mark.start >= right) return [{...mark, start: mark.start + shift, end: mark.end + shift}]
      return []
    })
  }
  return {...beat, text: value, emphasis: rebase(beat.emphasis),
    ...(beat.wordStyles && {wordStyles: rebase(beat.wordStyles)})}
}

export function styleAt(beat: Beat, selection: TextRange): WordStyle {
  const runs = (beat.wordStyles ?? []).filter(run => run.start < selection.end && run.end > selection.start)
  const keys = ['color', 'weight', 'marker', 'italic'] as const
  const covered = runs.reduce((sum, run) => sum + Math.min(run.end, selection.end) - Math.max(run.start, selection.start), 0)
  if (!runs.length || covered !== selection.end - selection.start) return {}
  return Object.fromEntries(keys.filter(key => runs.every(run => run.style[key] === runs[0].style[key]))
    .map(key => [key, runs[0].style[key]]))
}

export function editStyle(beat: Beat, selection: TextRange, patch: WordStyle, reset = false): StyledRange[] {
  const spans = beat.wordStyles ?? []
  const cuts = [...new Set([selection.start, selection.end, ...spans.flatMap(run => [run.start, run.end])])].sort((a, b) => a - b)
  const result: StyledRange[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i]
    const end = cuts[i + 1]
    const prior = spans.find(run => run.start <= start && run.end >= end)?.style
    const inside = start >= selection.start && end <= selection.end
    const style: WordStyle = Object.fromEntries(Object.entries(inside ? {...(reset ? {} : prior), ...patch} : prior ?? {})
      .filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    if (!Object.keys(style).length) continue
    const previous = result.at(-1)
    if (previous?.end === start && JSON.stringify(previous.style) === JSON.stringify(style)) previous.end = end
    else result.push({start, end, style})
  }
  return result
}

export function withAnchor(beat: Beat, selection: TextRange) {
  const existing = beat.emphasis.find(mark => mark.role === 'Anchor' && mark.start === selection.start && mark.end === selection.end)
  if (existing) return {beat, anchor: existing}
  const anchor = {...selection, id: newId(), role: 'Anchor'} as const
  const emphasis = beat.emphasis.flatMap(mark => {
    if (mark.end <= selection.start || mark.start >= selection.end) return [mark]
    const parts: Emphasis[] = []
    if (mark.start < selection.start) parts.push({...mark, end: selection.start})
    if (mark.end > selection.end) parts.push({...mark, start: selection.end, id: newId()})
    return parts
  })
  if (emphasis.length >= 100) return
  return {beat: {...beat, emphasis: [...emphasis, anchor].sort((a, b) => a.start - b.start)}, anchor}
}

export function matchingAnchors(beat: Beat, next: Beat) {
  const incoming = next.emphasis.filter(mark => mark.role === 'Anchor')
  return beat.emphasis.filter(mark => mark.role === 'Anchor').flatMap(from => incoming
    .filter(to => beat.text.slice(from.start, from.end) === next.text.slice(to.start, to.end))
    .map(to => ({from, to})))
}

export function linkedAnchors(beat: Beat, next?: Beat) {
  const a = beat.emphasis.find(mark => mark.role === 'Anchor' && mark.id === beat.transition.from)
  const b = next?.emphasis.find(mark => mark.role === 'Anchor' && mark.id === beat.transition.to)
  if (!a || !b || !next || beat.text.slice(a.start, a.end) !== next.text.slice(b.start, b.end)) return undefined
  return [a, b] as const
}
export function repairLinks(doc: Document): Document {
  return {...doc, beats: doc.beats.map((beat, index) => {
    if (beat.transition.type !== 'Persist' || linkedAnchors(beat, doc.beats[index + 1])) return beat
    if (!beat.transition.from) return beat
    return {...beat, transition: {type: 'Persist', broken: true}}
  })}
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const id = (v: unknown): v is string => text(v, 100) && v.length > 0
const range = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v)
function validBeat(value: unknown): value is Beat {
  if (!object(value) || !id(value.id) || !text(value.text, 5000) || !range(value.duration, 0.5, 120) ||
      !oneOf(value.mode, modes) || !oneOf(value.effect, effects) || !oneOf(value.reveal, reveals) ||
      !range(value.intensity, 0, 100) || !Array.isArray(value.emphasis) || value.emphasis.length > 100) return false
  if (value.timing !== undefined && (!object(value.timing) ||
      Object.keys(value.timing).some(key => key !== 'revealDuration') ||
      !range(value.timing.revealDuration, 0.1, value.duration))) return false
  if (value.scene !== undefined && !validScene(value.scene)) return false
  if (value.framing !== undefined && !validFraming(value.framing)) return false
  if (value.impact !== undefined && !validImpact(value.impact)) return false
  const shapeCount = (value.scene as Scene | undefined)?.shapes?.length ?? 0
  if (value.cues !== undefined && !validCues(value.cues, value.duration, shapeCount)) return false
  const placement = value.placement
  if (placement !== undefined && (!object(placement) ||
      (placement.position !== undefined && !range(placement.position, -100, 100)) ||
      (placement.scale !== undefined && !range(placement.scale, 50, 150)) ||
      (placement.overlap !== undefined && !range(placement.overlap, 0, 2)))) return false
  const t = value.typography
  if (!object(t) || !oneOf(t.font, fonts) || !range(t.size, 36, 170) || !range(t.weight, 400, 900) ||
      !range(t.leading, 1, 1.8) || !range(t.width, 45, 92) ||
      !oneOf(t.align, ['Left', 'Center', 'Right']) || typeof t.bionic !== 'boolean') return false
  const transition = value.transition
  if (!object(transition) || !oneOf(transition.type, transitions) ||
      !(transition.from === undefined && transition.to === undefined ||
        transition.type === 'Persist' && id(transition.from) && id(transition.to))) return false
  if (transition.broken !== undefined &&
      (transition.broken !== true || transition.type !== 'Persist' || transition.from !== undefined)) return false
  const edges = boundaries(value.text)
  if (value.wordStyles !== undefined) {
    if (!Array.isArray(value.wordStyles) || value.wordStyles.length > 5000) return false
    let last = 0
    for (const run of value.wordStyles) {
      if (!object(run) || !range(run.start, last, value.text.length) || !range(run.end, run.start + 1, value.text.length) ||
          !edges.has(run.start) || !edges.has(run.end) || !object(run.style)) return false
      const {color, weight, marker, italic} = run.style
      if ((color !== undefined && !oneOf(color, wordColors)) ||
          (weight !== undefined && !oneOf(weight, wordWeights)) ||
          (marker !== undefined && marker !== true) || (italic !== undefined && italic !== true) ||
          (color === undefined && weight === undefined && marker === undefined && italic === undefined)) return false
      last = run.end
    }
  }
  const used = new Set<string>()
  let lastEnd = 0
  for (const mark of value.emphasis) {
    if (!object(mark) || !id(mark.id) || used.has(mark.id) || !range(mark.start, lastEnd, value.text.length) ||
        !range(mark.end, mark.start + 1, value.text.length) || !edges.has(mark.start) || !edges.has(mark.end) ||
        !oneOf(mark.role, roles)) return false
    used.add(mark.id)
    lastEnd = mark.end
  }
  return true
}
export function decode(value: unknown): Document {
  if (!object(value) || value.documentVersion !== 1 || !id(value.title) ||
      !text(value.originalText, 25000) || !oneOf(value.theme, Object.keys(themes)) ||
      (value.safeArea !== undefined && typeof value.safeArea !== 'boolean') || !range(value.seed, 0, 4294967295) || !Number.isInteger(value.seed) || !Array.isArray(value.beats) ||
      value.beats.length < 1 || value.beats.length > 5 || !value.beats.every(validBeat) ||
      new Set(value.beats.map(beat => beat.id)).size !== value.beats.length) {
    throw new Error('Invalid Text Lab v1 document. Check the document format, emphasis ranges, scene settings and reveal timing.')
  }
  return repairLinks(value as Document)
}
export function mutate(beat: Beat): Beat {
  const {typography} = beat
  return {...beat, typography: {...typography,
    size: Math.max(36, Math.min(170, typography.size + (Math.random() < 0.5 ? -12 : 12))),
    align: (['Left', 'Center', 'Right'] as const).filter(a => a !== typography.align)[Math.floor(Math.random() * 2)],
  }, intensity: (beat.intensity + 25 + Math.round(Math.random() * 30)) % 101}
}
