import {expect, test, type Locator, type Page} from '@playwright/test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {decode, type Document} from '../src/model'
import type {Scene} from '../src/scene'
import {beatStart, totalTime} from '../src/timeline'

const exampleBytes = await readFile(new URL('../examples/visual-scenes-meta-demo.json', import.meta.url))
const example = decode(JSON.parse(exampleBytes.toString()))
const lab = (page: Page) => page.locator('.live-preview canvas')
const reel = (page: Page) => page.locator('#full-preview canvas')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const pixels = (canvas: Locator) => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())
const fingerprint = async (canvas: Locator) => hash(await pixels(canvas))
const choice = (page: Page, group: string, name: string) =>
  page.getByRole('group', {name: group, exact: true}).getByRole('button', {name, exact: true})

async function scrub(page: Page, value: number) {
  await page.getByRole('slider', {name: 'Scrub time'}).evaluate((node, time) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, String(time))
    node.dispatchEvent(new Event('input', {bubbles: true}))
  }, value)
  await expect(page.locator('.timecode')).toContainText(value.toFixed(1) + 's')
}

test('Scene v1 validates the meta demo, applies independent defaults and rejects malformed fields', () => {
  expect(decode(JSON.parse(JSON.stringify(example)))).toEqual(example)
  expect(example.beats).toHaveLength(5)
  expect(totalTime(example)).toBeCloseTo(24.7)
  const changeScene = (scene: unknown) => decode({...example, beats: [{...example.beats[0], scene}]})
  expect(changeScene({background: {kind: 'Flow'}, shapes: [{kind: 'Line'}], typeMotion: {kind: 'Slide'}}).beats[0].scene)
    .toEqual({background: {kind: 'Flow'}, shapes: [{kind: 'Line'}], typeMotion: {kind: 'Slide'}})
  for (const scene of [null, [], {unknown: true}, {background: {kind: 'Photo'}},
    {background: {kind: 'Grain', scale: 1e6}}, {background: {kind: 'Flow', speed: 'fast'}}, {background: {kind: 'Off', url: 'x'}},
    {shapes: Array.from({length: 4}, () => ({kind: 'Circle'}))}, {shapes: [{kind: 'Circle', x: -1}]},
    {shapes: [{kind: 'Line', tone: 'Purple'}]}, {shapes: [{kind: 'Rectangle', front: true}]},
    {typeMotion: {kind: 'Oversized', amount: Infinity}}]) {
    expect(() => changeScene(scene)).toThrow()
  }
})

test('each scene family changes real pixels at fixed timestamps and the long-text fallback stays bounded', async ({page}) => {
  await page.goto('/')
  const checks = await page.evaluate(async (document: Document) => {
    const {renderFrame, renderLabFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const {createLayout, lab}: typeof import('../src/layout') = await import('/src/layout.ts' as string)
    const {typographyPose}: typeof import('../src/scene-render') = await import('/src/scene-render.ts' as string)
    const reelCanvas = window.document.createElement('canvas')
    reelCanvas.width = 1080
    reelCanvas.height = 1920
    const reel = reelCanvas.getContext('2d')!
    const labCanvas = window.document.createElement('canvas')
    labCanvas.width = 1080
    labCanvas.height = 420
    const wide = labCanvas.getContext('2d')!
    const original = document.beats[0]
    const plain = {...document, beats: [{...original, scene: undefined}]}
    renderFrame(reel, plain, 1.2)
    renderLabFrame(wide, plain, 0, 0.3, false)
    const unstyled = reelCanvas.toDataURL()
    const unstyledLab = labCanvas.toDataURL()
    const scenes: Scene[] = [
      ...(['Gradient Drift', 'Flow', 'Grain'] as const).map(kind => ({background: {kind}})),
      ...(['Circle', 'Line', 'Rectangle'] as const).map(kind => ({shapes: [{kind}]})),
      ...(['Punch', 'Slide', 'Oversized'] as const).map(kind => ({typeMotion: {kind}})),
    ]
    const each = scenes.map(scene => {
      const value = {...plain, beats: [{...original, scene}]}
      renderFrame(reel, value, 1.2)
      renderLabFrame(wide, value, 0, 0.3, false)
      return reelCanvas.toDataURL() !== unstyled && labCanvas.toDataURL() !== unstyledLab
    })
    const moving: Scene[] = [
      ...scenes.slice(0, 3),
      {shapes: [{kind: 'Circle', motion: 'Expand'}]},
      {shapes: [{kind: 'Rectangle', motion: 'Drift'}]},
      {typeMotion: {kind: 'Punch'}},
      {typeMotion: {kind: 'Slide'}},
    ]
    const timing = moving.map(scene => {
      const value = {...plain, beats: [{...original, scene}]}
      renderLabFrame(wide, value, 0, 0.11, false)
      const initial = labCanvas.toDataURL()
      renderLabFrame(wide, value, 0, 0.66, false)
      const moves = labCanvas.toDataURL() !== initial
      renderLabFrame(wide, value, 0, 0.11, false)
      return moves && labCanvas.toDataURL() === initial
    })
    const long = {...original, text: 'A long line that continues. '.repeat(20), scene: {typeMotion: {kind: 'Oversized' as const, amount: 100}}}
    const longPose = typographyPose(long, createLayout(wide, long, lab), 1, lab)
    const off = {...plain, beats: [{...original, scene: {background: {kind: 'Off' as const}, shapes: [], typeMotion: {kind: 'Off' as const}}}]}
    renderFrame(reel, off, 1.2)
    return {each, timing, fallback: longPose.scale, offMatches: reelCanvas.toDataURL() === unstyled}
  }, example)
  expect(checks.each).not.toContain(false)
  expect(checks.timing).not.toContain(false)
  expect(checks.fallback).toBeLessThanOrEqual(1.16)
  expect(checks.offMatches).toBe(true)
})

test('the sticky Lab updates scene intensity and speed before touch release without remeasuring text', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('/')
  await page.locator('.scene-editor summary').click()
  await choice(page, 'Background', 'Gradient Drift').click()
  const first = await fingerprint(lab(page))
  await expect.poll(() => fingerprint(lab(page))).not.toBe(first)
  await page.getByRole('button', {name: 'Pause live preview'}).click()
  const touch = await page.context().newCDPSession(page)
  await touch.send('Emulation.setTouchEmulationEnabled', {enabled: true})
  const measure = await page.evaluateHandle(() => {
    const ctx = document.querySelector<HTMLCanvasElement>('.live-preview canvas')!.getContext('2d')!
    const original = ctx.measureText.bind(ctx)
    const counter = {calls: 0}
    ctx.measureText = text => {counter.calls++; return original(text)}
    return counter
  })
  for (const name of ['Background intensity', 'Background speed']) {
    const slider = page.getByRole('slider', {name})
    await slider.evaluate(node => node.scrollIntoView({block: 'center'}))
    const box = (await slider.boundingBox())!
    const point = (value: number) => [{x: box.x + 8 + (box.width - 16) * value, y: box.y + box.height / 2}]
    await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: point(0.22)})
    const before = await fingerprint(lab(page))
    await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: point(0.52)})
    await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: point(0.91)})
    expect(await fingerprint(lab(page))).not.toBe(before)
    expect(Number(await slider.inputValue())).toBeGreaterThan(name.endsWith('speed') ? 1.5 : 80)
    await expect(lab(page)).toBeInViewport()
    await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  }
  expect(await measure.evaluate(counter => counter.calls)).toBe(0)
  await page.getByRole('button', {name: 'Add shape'}).click()
  await choice(page, 'Shape motion', 'Expand').click()
  await choice(page, 'Type motion', 'Punch').click()
  await expect(lab(page)).toBeInViewport()
  await page.getByRole('button', {name: 'Reset scene'}).click()
  await expect(choice(page, 'Background', 'Off')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', {name: 'Remove shape'})).toHaveCount(0)
})

test('the meta story renders distinct beats and round-trips the same Compose frame and exported PNG', async ({page}) => {
  await page.goto('/')
  const source = page.getByLabel('Import document')
  await source.setInputFiles({name: 'visual-scenes-meta-demo.json', mimeType: 'application/json', buffer: exampleBytes})
  await expect(page.locator('#composition-title')).toHaveValue(example.title)
  await page.getByRole('button', {name: 'Compose', exact: true}).click()
  await expect(page.getByRole('region', {name: 'Composition layout'})).toContainText('24.7s total')
  const frames = new Set<string>()
  for (const [index, beat] of example.beats.entries()) {
    const start = beatStart(example, index)
    for (const offset of [0.07, beat.duration * 0.53, beat.duration - 0.12]) {
      await scrub(page, start + offset)
      frames.add(await fingerprint(reel(page)))
    }
  }
  expect(frames.size).toBe(15)
  await scrub(page, 11.75)
  const reference = await fingerprint(reel(page))
  await page.getByRole('checkbox', {name: 'Reels safe-area guides'}).check()
  await page.getByRole('button', {name: 'Export', exact: true}).click()
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export current PNG'}).click()])
  const pngData = await readFile((await png.path())!)
  expect(hash('data:image/png;base64,' + pngData.toString('base64'))).toBe(reference)
  await page.getByRole('button', {name: 'Export', exact: true}).click()
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export JSON'}).click()])
  const exported = await readFile((await json.path())!)
  expect(decode(JSON.parse(exported.toString()))).toEqual({...example, safeArea: true})
  await page.reload()
  await source.setInputFiles({name: 'scene-export.json', mimeType: 'application/json', buffer: exported})
  await page.getByRole('button', {name: 'Compose', exact: true}).click()
  await scrub(page, 11.75)
  await expect(page.locator('.safe-guides')).toBeVisible()
  expect(await fingerprint(reel(page))).toBe(reference)
})

test('scene treatment carries the tied Anchor through Persist with and without overlap', async ({page}) => {
  await page.goto('/')
  const captures = await page.evaluate(async () => {
    const {demos}: typeof import('../src/demos') = await import('/src/demos.ts' as string)
    const {renderFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const fill = ctx.fillText.bind(ctx)
    const anchors: {size: string; alpha: number}[] = []
    ctx.fillText = (text, x, y, maxWidth) => {
      if (text === 'tide' && ctx.globalAlpha === 1) anchors.push({size: ctx.font, alpha: ctx.globalAlpha})
      maxWidth === undefined ? fill(text, x, y) : fill(text, x, y, maxWidth)
    }
    const base = demos[2]
    const results = []
    for (const overlap of [0, 1]) {
      const scene = {...base, beats: base.beats.map((beat, index) => ({
        ...beat, placement: {overlap: index === 0 ? overlap : 0},
        scene: {background: {kind: index ? 'Flow' as const : 'Gradient Drift' as const},
          shapes: [{kind: 'Circle' as const, motion: 'Expand' as const}],
          typeMotion: {kind: index ? 'Slide' as const : 'Oversized' as const}},
      }))}
      const time = overlap ? 5.5 : 5.55
      renderFrame(ctx, base, time)
      const plain = canvas.toDataURL()
      anchors.length = 0
      renderFrame(ctx, scene, time)
      results.push({count: anchors.length, changed: canvas.toDataURL() !== plain})
    }
    return results
  })
  expect(captures).toEqual([{count: 1, changed: true}, {count: 1, changed: true}])
})

for (const [width, height] of [[320, 568], [375, 812], [390, 844], [428, 926], [1440, 900]]) {
  test.describe(`Scene at ${width}px`, () => {
    test.use({viewport: {width, height}, isMobile: width < 500, hasTouch: width < 500})
    test('scene controls and word tools remain usable below the sticky preview', async ({page}) => {
      await page.goto('/')
      await page.locator('.scene-editor summary').click()
      await choice(page, 'Background', 'Flow').click()
      await page.getByRole('button', {name: 'Add shape'}).click()
      await choice(page, 'Shape type', 'Rectangle').click()
      await choice(page, 'Shape motion', 'Drift').click()
      await choice(page, 'Type motion', 'Oversized').click()
      await expect(lab(page)).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      const field = page.locator('#beat-text')
      await field.focus()
      if (width < 500) await page.setViewportSize({width, height: Math.floor(height * 0.61)})
      await field.fill('Свет, окно и движение.')
      await choice(page, 'Text workspace', 'Style words').click()
      const word = page.getByRole('group', {name: 'Choose words'}).getByRole('button', {name: 'Свет', exact: true})
      await word.click()
      await page.getByRole('button', {name: 'Marker', exact: true}).click()
      await expect(word).toHaveAttribute('aria-pressed', 'true')
      await expect(lab(page)).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    })
  })
}
