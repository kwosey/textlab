export const fps = 30
const ids = ['hook', 'flow', 'brake', 'reverse', 'payoff']

// Intentionally scoped to the Experiment 002 storyboard. Unhandled timing fails closed.
export function adapt(source) {
  if (source.documentVersion !== 1 || source.beats?.length !== ids.length) {
    throw new Error('Expected the five-beat Text Lab v1 storyboard')
  }
  let start = 0
  const beats = source.beats.map((beat, index) => {
    if (beat.id !== ids[index] || typeof beat.text !== 'string' || !beat.text.trim() ||
        !Number.isFinite(beat.duration) || beat.duration <= 0 || beat.placement?.overlap ||
        beat.transition?.type !== 'Replace' || beat.transition.from || beat.transition.to ||
        (index < ids.length - 1 && beat.impact?.kind !== 'Cut') ||
        !['Reading', 'Reveal'].includes(beat.mode) || (beat.mode === 'Reveal' && beat.reveal !== 'Lines')) {
      throw new Error(`Unsupported beat or timing at index ${index}`)
    }
    const reveal = beat.mode === 'Reading' ? 0 : beat.timing?.revealDuration
    if (!Number.isFinite(reveal) || reveal < 0 || reveal > beat.duration ||
        (beat.mode === 'Reveal' && reveal === 0)) throw new Error(`Invalid Reveal in ${beat.id}`)
    const shapes = beat.scene?.shapes ?? []
    const moves = shapes.map((shape, target) => {
      const cue = (beat.cues ?? []).filter(item => item.target === target)
      if (!Number.isFinite(shape.x) || !['Rectangle', 'Line'].includes(shape.kind) || cue.length > 1) {
        throw new Error(`Unsupported object in ${beat.id}`)
      }
      const [move] = cue
      if (move && (move.action !== 'Move' || ![move.x, move.at, move.duration].every(Number.isFinite) ||
          move.at < 0 || move.duration <= 0 || move.at + move.duration > beat.duration + 1e-9)) {
        throw new Error(`Unsupported Move in ${beat.id}`)
      }
      return {kind: shape.kind, x: shape.x, to: move?.x ?? shape.x, at: move?.at ?? 0, duration: move?.duration ?? 0}
    })
    if ((beat.cues ?? []).some(cue => !Number.isInteger(cue.target) || !moves[cue.target])) {
      throw new Error(`Unsupported cue target in ${beat.id}`)
    }
    const end = start + beat.duration
    const frames = [start, end].map(time => Math.round(time * fps))
    if (Math.abs(frames[1] / fps - end) > 1e-9) throw new Error(`Off-grid cut in ${beat.id}`)
    const result = {id: beat.id, text: beat.text, start: frames[0], end: frames[1], reveal, moves}
    start = end
    return result
  })
  return {title: source.title, beats, durationInFrames: beats.at(-1).end}
}

export function moveAt(move, seconds) {
  const p = move.duration ? Math.max(0, Math.min(1, (seconds - move.at) / move.duration)) : 0
  return move.x + (move.to - move.x) * p * p * (3 - 2 * p)
}
