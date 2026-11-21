import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cameraAt, geometry, landmarks, project} from './src/projection.mjs'

function coveringEdge(frame) {
  const [x,y,z]=geometry.wallEdge
  return Math.max(landmarks(frame).wall,project([x,y,z+.92],cameraAt(frame))[0])
}

test('one camera projects a hidden, clipped, then visible fixed source', () => {
  for(const [frame,state] of [[0,'hidden'],[60,'clipped'],[141,'open']]) {
    const {lamp,lampRadius}=landmarks(frame)
    const edge=coveringEdge(frame)
    const visible=edge>=lamp+lampRadius?'hidden':edge<=lamp-lampRadius?'open':'clipped'
    assert.equal(visible,state)
  }
})

test('near, middle and far landmarks have distinct motion; camera settles', () => {
  const start=landmarks(0), stop=landmarks(141)
  assert.ok(start.wall-stop.wall > 3*(start.portal-stop.portal))
  assert.ok(start.portal-stop.portal > start.lamp-stop.lamp)
  assert.deepEqual(cameraAt(131),cameraAt(149))
  assert.ok(Math.abs(cameraAt(131).x-cameraAt(130).x) < .001)
})
