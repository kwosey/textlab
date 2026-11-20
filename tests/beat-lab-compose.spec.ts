import {expect, test, type Locator} from '@playwright/test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {decode, type Document} from '../src/model'
import {beatStart, locate, overlap, totalTime} from '../src/timeline'

const legacy = JSON.parse(await readFile(new URL('../examples/a-quiet-interval.json', import.meta.url), 'utf8'))
const digest = async (canvas: Locator) => createHash('sha256').update(
  await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL()),
).digest('hex')

test('legacy documents keep their timing and optional layout validates and round-trips', () => {
  const doc = decode(structuredClone(legacy))
  expect(doc).toEqual(legacy)
  expect(totalTime(doc)).toBe(15)
  doc.beats[0].placement = {position: -60, scale: 110, overlap: 1.5}
  doc.safeArea = true
  expect(decode(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  expect(overlap(doc.beats[0], doc.beats[1])).toBe(1.5)
  expect(beatStart(doc, 1)).toBe(6.5)
  expect(locate(doc, 7).local).toBe(0.5)
  expect(totalTime(doc)).toBe(13.5)
  doc.beats[1].duration = 0.5
  expect(overlap(doc.beats[0], doc.beats[1])).toBe(0.2)
  expect(() => decode({...doc, safeArea: 'yes'})).toThrow()
  expect(() => decode({...doc, beats: [{...doc.beats[0], placement: {scale: 999}}]})).toThrow()
})

test('Wave, Echo and Scatter render immediately and intensity updates before drag release', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('/')
  const live = page.locator('.live-preview canvas')
  const beatField = page.locator('#beat-text')
  await beatField.fill('Волна переносит свет через тихую воду.')
  await page.getByRole('group', {name: 'Presentation mode'}).getByRole('button', {name: 'Transform'}).click()
  const effect = (name: string) => page.getByRole('group', {name: 'Motion effect'}).getByRole('button', {name})
  const frames: string[] = []
  for (const name of ['Wave', 'Echo', 'Scatter']) {
    await effect(name).click()
    await expect(live).toBeInViewport()
    const start = await digest(live)
    await expect.poll(() => digest(live)).not.toBe(start)
    frames.push(await digest(live))
  }
  expect(new Set(frames).size).toBe(3)

  await effect('Wave').click()
  const slider = page.getByRole('slider', {name: 'Intensity'})
  await slider.scrollIntoViewIfNeeded()
  await expect(live).toBeInViewport()
  const box = (await slider.boundingBox())!
  const pointAt = (value: number) => box.x + 8 + (box.width - 16) * value / 100
  const touch = await page.context().newCDPSession(page)
  await touch.send('Emulation.setTouchEmulationEnabled', {enabled: true})
  const finger = (type: 'touchStart' | 'touchMove', value: number) =>
    touch.send('Input.dispatchTouchEvent', {type, touchPoints: [{x: pointAt(value), y: box.y + box.height / 2}]})
  await finger('touchStart', 20)
  const at20 = await digest(live)
  await finger('touchMove', 55)
  const at55 = await digest(live)
  await finger('touchMove', 90)
  const at90 = await digest(live)
  expect(new Set([at20, at55, at90]).size).toBe(3)
  expect(Number(await slider.inputValue())).toBeGreaterThan(80)
  await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
  await page.getByRole('button', {name: 'Pause live preview'}).click()
  const paused = await digest(live)
  await beatField.fill('Тихая вода отражает небо.')
  expect(await digest(live)).not.toBe(paused)
  await beatField.press('Control+Home')
  await beatField.press('Shift+ArrowRight')
  await page.getByRole('button', {name: 'Strong', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Remove emphasis Т'})).toBeVisible()
  await page.getByRole('button', {name: 'Mutate'}).click()
  await expect(page.getByRole('button', {name: 'Pause live preview'})).toBeVisible()
  await expect(beatField).toHaveValue('Тихая вода отражает небо.')
})

test('local transition loops show Replace, linked Persist and Transform between neighboring beats', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'The Returning Tide'}).click()
  const live = page.locator('.live-preview canvas')
  const modes = page.getByRole('group', {name: 'Preview mode'})
  const transition = page.getByRole('group', {name: 'Transition', exact: true})
  for (const name of ['Persist', 'Replace', 'Transform']) {
    await transition.getByRole('button', {name, exact: true}).click()
    await expect(modes.getByRole('button', {name: 'Transition'})).toHaveAttribute('aria-pressed', 'true')
    const first = await digest(live)
    await expect.poll(() => digest(live)).not.toBe(first)
    if (name === 'Persist') await expect(page.getByLabel('Link anchor ranges')).toHaveValue(/tide-in.*tide-out/)
  }
  await page.getByRole('region', {name: 'Editor'}).locator('.beat-card').last().click()
  await expect(modes.getByRole('button', {name: 'Transition'})).toBeDisabled()
})

test('Compose placement and overlap change exported frames and safe guides stay outside PNG', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Compose', exact: true}).click()
  const canvas = page.locator('#full-preview canvas')
  const controls = page.getByRole('region', {name: 'Composition layout'})
  const start = await digest(canvas)
  await controls.getByRole('button', {name: 'Top', exact: true}).click()
  const top = await digest(canvas)
  expect(top).not.toBe(start)
  await controls.getByRole('slider', {name: 'Scale'}).press('End')
  const scaled = await digest(canvas)
  expect(scaled).not.toBe(top)
  await controls.getByRole('group', {name: 'Alignment'}).getByRole('button', {name: 'Right'}).click()
  const aligned = await digest(canvas)
  expect(aligned).not.toBe(scaled)
  await controls.getByRole('slider', {name: 'Width'}).press('Home')
  const narrower = await digest(canvas)
  expect(narrower).not.toBe(aligned)
  const timing = controls.getByRole('spinbutton', {name: 'Beat duration'})
  await timing.fill('5')
  await timing.press('Enter')
  await expect(controls).toContainText('12.0s total')
  await controls.getByRole('slider', {name: 'Overlap'}).press('End')
  await expect(controls).toContainText('10.0s total')
  await controls.getByRole('checkbox', {name: 'Reels safe-area guides'}).check()
  await expect(page.locator('.safe-guides')).toBeVisible()
  expect(await digest(canvas)).toBe(narrower)
  await page.getByRole('button', {name: 'Export', exact: true}).click()
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export current PNG'}).click()])
  const bytes = await readFile((await png.path())!)
  expect(createHash('sha256').update('data:image/png;base64,' + bytes.toString('base64')).digest('hex')).toBe(narrower)
  await page.reload()
  await page.getByRole('button', {name: 'Compose', exact: true}).click()
  await expect(controls).toContainText('10.0s total')
  expect(await digest(canvas)).toBe(narrower)
})

test('overlap limits paragraph interference and Persist keeps its anchor at zero overlap', async ({page}) => {
  await page.goto('/')
  const check = await page.evaluate(async (doc: Document) => {
    const render: typeof import('../src/render') = await import('/src/render.ts' as string)
    const {demos}: typeof import('../src/demos') = await import('/src/demos.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const draws: {text: string; alpha: number}[] = []
    const fill = ctx.fillText.bind(ctx)
    ctx.fillText = (text, x, y, maxWidth) => {
      if (y === 0) draws.push({text, alpha: ctx.globalAlpha})
      maxWidth === undefined ? fill(text, x, y) : fill(text, x, y, maxWidth)
    }
    doc.beats[0].placement = {overlap: 2}
    doc.beats[0].text = 'Outgoing paragraph '.repeat(18)
    doc.beats[1].text = 'Incoming paragraph '.repeat(18)
    render.renderFrame(ctx, doc, 7)
    const alphas = draws.filter(draw => /going|coming/.test(draw.text)).map(draw => draw.alpha)
    draws.length = 0
    render.renderFrame(ctx, demos[2], 5.55)
    const anchors = draws.filter(draw => draw.text === 'tide' && draw.alpha === 1).length
    return {alphas, anchors}
  }, legacy)
  expect(check.alphas.length).toBeGreaterThan(0)
  expect(Math.max(...check.alphas)).toBeLessThan(0.25)
  expect(check.anchors).toBe(1)
})
