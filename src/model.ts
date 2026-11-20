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
  transition: { type: typeof transitions[number]; from?: string; to?: string }
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
export function editText(beat: Beat, value: string): Beat {
  const old = segments(beat.text)
  const next = segments(value)
  let prefix = 0
  let suffix = 0
  while (prefix < old.length && prefix < next.length && old[prefix].segment === next[prefix].segment) prefix++
  while (suffix < Math.min(old.length, next.length) - prefix &&
    old[old.length - 1 - suffix].segment === next[next.length - 1 - suffix].segment) suffix++
  const left = old[prefix]?.index ?? beat.text.length
  const right = old[old.length - suffix]?.index ?? beat.text.length
  const shift = value.length - beat.text.length
  const emphasis = beat.emphasis.flatMap(mark => {
    if (mark.end <= left) return [mark]
    if (mark.start >= right) return [{...mark, start: mark.start + shift, end: mark.end + shift}]
    return []
  })
  return {...beat, text: value, emphasis}
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
    return {...beat, transition: {type: 'Persist'}}
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
  const edges = boundaries(value.text)
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
    throw new Error('Invalid Text Lab v1 document. Check the document format and emphasis ranges.')
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
