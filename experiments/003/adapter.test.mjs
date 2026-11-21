import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {adapt, moveAt} from './src/adapter.mjs'

const source = JSON.parse(await readFile(new URL('../002/composition.json', import.meta.url), 'utf8'))
test('keeps source text, cut positions, reveal and braking order', () => {
  const {beats, durationInFrames} = adapt(source)
  assert.equal(durationInFrames, 480)
  assert.deepEqual(beats.map(b=>[b.start,b.end]), [[0,75],[75,165],[165,300],[300,390],[390,480]])
  assert.deepEqual(beats.map(b=>b.text), source.beats.map(b=>b.text))
  assert.deepEqual(beats.map(b=>b.reveal), [0,.45,1.35,.55,.55])
  assert.deepEqual(beats[2].moves.map(m=>m.duration), [2.2,1.38,.56])
  assert.ok(moveAt(beats[3].moves[0], 2) > moveAt(beats[3].moves[0], 1))
  assert.ok(moveAt(beats[3].moves[2], 2) < moveAt(beats[3].moves[2], 1))
})
test('rejects an unsupported overlap or cue instead of silently changing the result', () => {
  const changed = structuredClone(source)
  changed.beats[0].placement = {overlap: .25}
  assert.throws(()=>adapt(changed), /Unsupported beat/)
  changed.beats[0].placement.overlap = 0
  changed.beats[0].cues.push({target:'Text', action:'Hide', at:0, duration:.2})
  assert.throws(()=>adapt(changed), /Unsupported cue/)
})
