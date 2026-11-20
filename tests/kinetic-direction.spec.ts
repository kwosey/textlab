import {expect, test} from '@playwright/test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {cuePose} from '../src/direction'
import {editorialPrompt} from '../src/editorial-prompt'
import {decode, type Document} from '../src/model'

const demo = decode(JSON.parse(await readFile(new URL('../examples/perception-directors-cut.json', import.meta.url), 'utf8')))
const payload = {name: 'director.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(demo))}

test('the document validates cue lanes, ranges, targets and unknown properties', () => {
  expect(decode(JSON.parse(JSON.stringify(demo)))).toEqual(demo)
  for (const patch of [
    {cues: [{target: 4, action: 'Hide', at: 0, duration: 0}]},
    {cues: [{target: 'Text', action: 'Move', at: 0, duration: 0, x: 50, y: 50}]},
    {cues: [{target: 'Text', action: 'Hide', at: 3.4, duration: 0}]},
    {cues: [{target: 'Text', action: 'Hide', at: 0.1, duration: 1}, {target: 'Text', action: 'Show', at: 1, duration: 0}]},
    {cues: [{target: 'Text', action: 'Hide', at: 0, duration: 0, easing: 'linear'}]},
    {impact: {kind: 'Cut', duration: 0.1}}, {impact: {kind: 'Flash', duration: 6, intensity: 90}},
    {framing: {zoom: 341}}, {framing: {crop: 'true'}},
  ]) expect(() => decode({...demo, beats: [{...demo.beats[0], ...patch}]})).toThrow()
  const cues = demo.beats[0].cues!
  expect(cuePose(cues, 'Text', 0.41).scale).toBe(1)
  expect(cuePose(cues, 'Text', 0.52).scale).toBeCloseTo(1.265)
  expect(cuePose(cues, 'Text', 0.72).alpha).toBe(0)
  expect(cuePose(cues, 0, 0.88).scale).toBeCloseTo(3)
  expect(cuePose(cues, 0, 0.79, 53, 69).x).toBeCloseTo(55)
  expect(cuePose(cues, 0, 0, 53, 69).scale).toBeCloseTo(0.38)
})

test('Copy prompt writes the literal editorial brief and reports a rejected clipboard', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', {name: 'Export', exact: true}).click()
  await page.getByRole('button', {name: 'Copy prompt', exact: true}).press('Enter')
  await expect(page.getByText('Prompt copied', {exact: true})).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(editorialPrompt)
  expect(copied).toContain('https://github.com/kwosey/textlab/issues/13')
  expect(copied).toContain('DATA_CONTRACTS.md')
  expect(copied).toContain('.json')
  expect(await page.evaluate(() => localStorage.getItem('textlab:draft:v1'))).toBeNull()
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {value: () => Promise.reject(new DOMException('denied', 'NotAllowedError'))}))
  await page.getByRole('button', {name: 'Export', exact: true}).click()
  await page.getByRole('button', {name: 'Copy prompt', exact: true}).click()
  await expect(page.getByText('Clipboard unavailable.', {exact: false})).toBeVisible()
})

test('timeline samples and backwards seeks produce the same precise rendered result', async ({page}) => {
  await page.goto('/')
  const records = await page.evaluate(async (doc: Document) => {
    const {renderFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const {demos}: typeof import('../src/demos') = await import('/src/demos.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080; canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const draw = (document: Document, time: number) => {
      renderFrame(ctx, document, time)
      return canvas.toDataURL()
    }
    const times = [0.39, 0.52, 0.63, 0.72, 0.81, 0.93, 2.95, 3.06, 6.58, 16.2]
    const timeline = times.map(time => draw(doc, time))
    const replay = [...times].reverse().map(time => draw(doc, time)).reverse()
    const cutDoc = {...doc, beats: doc.beats.map((beat, i) => i ? beat : {...beat, impact: {kind: 'Cut' as const}})}
    const flash = draw(doc, 2.95) !== draw(cutDoc, 2.95)
    const tide = demos[2]
    const marked: boolean[] = []
    const native = ctx.fillText.bind(ctx)
    ctx.fillText = (text, x, y, max) => {
      if (text === 'tide' && ctx.globalAlpha === 1) marked.push(true)
      max === undefined ? native(text, x, y) : native(text, x, y, max)
    }
    const variants = ([{kind: 'Cut'}, {kind: 'Flash', duration: 0.22, intensity: 66},
      {kind: 'Impact Zoom', duration: 0.25, intensity: 75}] as const).map(impact => {
      marked.length = 0
      const value = {...tide, beats: tide.beats.map((beat, i) => i ? beat : {...beat, impact, placement: {overlap: 1}})}
      const frame = draw(value, 5.5)
      const anchor = marked.length === 1
      return {anchor, differs: frame !== draw(tide, 5.5)}
    })
    return {unique: new Set(timeline).size, identical: timeline.every((value, i) => value === replay[i]), flash, variants}
  }, demo)
  expect(records.unique).toBe(10)
  expect(records.identical).toBe(true)
  expect(records.flash).toBe(true)
  expect(records.variants).toEqual(Array(3).fill({anchor: true, differs: true}))
})

test('Director’s Cut round-trips and the exact cue preview uses the Compose reel', async ({page}) => {
  await page.goto('/')
  await page.getByLabel('Import document').setInputFiles(payload)
  await expect(page.locator('#composition-title')).toHaveValue(demo.title)
  await page.locator('.direction-editor > summary').click()
  const cue = page.locator('.cue').filter({hasText: '0.63s · Text · Hide'})
  await cue.locator('summary').click()
  await page.getByRole('button', {name: '9:16 proof'}).click()
  await cue.getByRole('button', {name: 'Preview cue'}).click()
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const proof = hash(await page.locator('.live-preview canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL()))
  await page.getByRole('button', {name: 'Compose', exact: true}).click()
  await page.getByRole('slider', {name: 'Scrub time'}).evaluate(node => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '0.63')
    node.dispatchEvent(new Event('input', {bubbles: true}))
  })
  expect(hash(await page.locator('#full-preview canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL()))).toBe(proof)
  await page.getByRole('button', {name: 'Export', exact: true}).click()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export JSON'}).click()])
  expect(decode(JSON.parse(await readFile((await file.path())!, 'utf8')))).toEqual(demo)
})

for (const width of [320, 375, 390, 428]) {
  test(`Direction controls fit at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 810})
    await page.goto('/')
    await page.getByLabel('Import document').setInputFiles(payload)
    await page.locator('.direction-editor > summary').click()
    await page.getByRole('slider', {name: 'Frame zoom'}).focus()
    await page.getByRole('button', {name: '9:16 proof'}).click()
    await expect(page.locator('.live-preview canvas')).toHaveAttribute('height', '1920')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

test('authors and removes a live cue without breaking undo or shape references', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Pause live preview'}).click()
  const pixels = () => page.locator('.live-preview canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL())
  const original = await pixels()
  await page.locator('.direction-editor > summary').click()
  await page.getByRole('button', {name: 'Add cue', exact: true}).click()
  expect(await pixels()).not.toBe(original)
  await page.locator('.cue summary').click()
  await page.getByLabel('Action', {exact: true}).selectOption('Show')
  expect(await pixels()).toBe(original)
  await page.getByRole('button', {name: 'Undo', exact: true}).click()
  expect(await pixels()).not.toBe(original)
  await page.getByRole('button', {name: 'Redo', exact: true}).click()
  expect(await pixels()).toBe(original)
  await page.getByLabel('Import document').setInputFiles(payload)
  await page.locator('.scene-editor').filter({hasText: 'Shapes'}).last().locator('summary').click()
  await page.getByRole('button', {name: 'Remove shape'}).click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('textlab:draft:v1')!))
  const beat = decode(saved).beats[0]
  expect(beat.scene?.shapes).toHaveLength(0)
  expect(beat.cues?.every(cue => cue.target === 'Text')).toBe(true)
})
