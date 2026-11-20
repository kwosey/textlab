import {expect, test, type Page} from '@playwright/test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {decode, type Document} from '../src/model'
import {overlap, revealHold, transitionSpan} from '../src/timeline'

const rhythm = decode(JSON.parse(await readFile(new URL('../examples/reading-rhythm.json', import.meta.url), 'utf8')))
const gaze = decode(JSON.parse(await readFile(new URL('../examples/persist-gaze.json', import.meta.url), 'utf8')))
const image = async (page: Page) => createHash('sha256').update(
  await page.locator('.live-preview canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL()),
).digest('hex')
const upload = (page: Page, doc: Document) => page.getByLabel('Import document').setInputFiles({
  name: 'document.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
})

test('explicit timing validates strict seconds and derives solo Hold', () => {
  expect(decode(JSON.parse(JSON.stringify(rhythm)))).toEqual(rhythm)
  expect(revealHold(rhythm.beats[0])).toBe(3)
  expect(transitionSpan(gaze.beats[0], gaze.beats[1])).toBe(0.9)
  const outgoing = {...gaze.beats[0], placement: {overlap: 1}}
  const incoming = gaze.beats[1]
  expect(overlap(outgoing, incoming)).toBe(1)
  expect(revealHold(incoming, undefined, outgoing)).toBe(2)
  expect(revealHold({...incoming, timing: {revealDuration: 0.4}}, undefined, outgoing)).toBe(2.5)
  for (const timing of [{revealDuration: Infinity}, {revealDuration: NaN}, {revealDuration: -1},
    {revealDuration: 0.05}, {revealDuration: 4.51}, {revealDuration: '1.5'}, {revealDuration: 1, revealEasing: 'EaseOut'}, {}]) {
    expect(() => decode({...rhythm, beats: [{...rhythm.beats[0], timing}]})).toThrow()
  }
  expect(decode({...rhythm, beats: [{...rhythm.beats[0], timing: {revealDuration: 4.5}}]}).beats[0].timing)
    .toEqual({revealDuration: 4.5})
})

test('Words, Lines and Phrases finish at the explicit deadline and hold in Compose', async ({page}) => {
  await page.goto('/')
  const results = await page.evaluate(async (doc: Document) => {
    const {renderFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const fill = ctx.fillText.bind(ctx)
    let last = 0
    ctx.fillText = (text, x, y, max) => {
      if (text === 'arrives.') last = ctx.globalAlpha
      max === undefined ? fill(text, x, y) : fill(text, x, y, max)
    }
    return (['Words', 'Lines', 'Phrases'] as const).map(reveal => {
      const project = {...doc, beats: [{...doc.beats[0], scene: undefined, text: 'First word.\nLast arrives.', reveal}]}
      const samples = [0.2, 1.4, 1.5, 3, 4.49].map(time => {
        last = 0
        renderFrame(ctx, project, time)
        return last
      })
      renderFrame(ctx, project, 1.5)
      const atFinish = canvas.toDataURL()
      renderFrame(ctx, project, 4.49)
      return {samples, holds: canvas.toDataURL() === atFinish}
    })
  }, rhythm)
  for (const {samples, holds} of results) {
    expect(samples[0]).toBe(0)
    expect(samples[1]).toBeLessThan(1)
    expect(samples.slice(2)).toEqual([1, 1, 1])
    expect(holds).toBe(true)
  }
})

test('the Lab uses real seconds, updates the paused frame live, and retains timing through export', async ({page}) => {
  await page.clock.install({time: new Date(0)})
  await page.clock.pauseAt(new Date(100))
  await page.goto('/')
  const doc = {...rhythm, beats: [{...rhythm.beats[0], scene: undefined}]}
  await upload(page, doc)
  await expect(page.locator('.live-time-badge')).toHaveText('Real time')
  await expect(page.getByLabel('Hold duration')).toHaveText('Hold 3.00s')
  await page.getByRole('button', {name: 'Restart live preview'}).evaluate(node => (node as HTMLButtonElement).click())
  await page.clock.runFor(1400)
  const at1400 = await image(page)
  await page.clock.runFor(150)
  const at1550 = await image(page)
  expect(at1400).not.toBe(at1550)
  await page.clock.runFor(2000)
  expect(await image(page)).toBe(at1550)
  await page.getByRole('button', {name: 'Pause live preview'}).evaluate(node => (node as HTMLButtonElement).click())
  await page.getByRole('slider', {name: 'Reveal duration'}).evaluate(node => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '4.2')
    node.dispatchEvent(new Event('input', {bubbles: true}))
  })
  expect(await image(page)).not.toBe(at1550)
  await expect(page.getByLabel('Hold duration')).toHaveText('Hold 0.30s')
  await page.getByRole('button', {name: 'Export', exact: true}).evaluate(node => (node as HTMLButtonElement).click())
  const [file] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', {name: 'Export JSON'}).evaluate(node => (node as HTMLButtonElement).click())])
  const saved = decode(JSON.parse(await readFile((await file.path())!, 'utf8')))
  expect(saved.beats[0].timing).toEqual({revealDuration: 4.2})
  await upload(page, saved)
  await expect(page.getByRole('slider', {name: 'Reveal duration'})).toHaveValue('4.2')
  await expect(page.getByRole('button', {name: 'Transition', exact: true})).toBeDisabled()
})

test('the styled gaze moves across the handoff at 60 fps without vanishing or snapping back', async ({page}) => {
  await page.goto('/')
  const review = await page.evaluate(async (doc: Document) => {
    const {renderFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const probe = document.createElement('canvas')
    probe.width = 270
    probe.height = 480
    const sampler = probe.getContext('2d', {willReadFrequently: true})!
    return [{overlap: 0, mixed: false}, {overlap: 1, mixed: false}, {overlap: 0, mixed: true}].map(({overlap, mixed}) => {
      const [first, second] = doc.beats
      const project = {...doc, beats: [{...first, placement: {...first.placement, overlap}},
        {...second, wordStyles: mixed ? undefined : second.wordStyles}]}
      const start = doc.beats[0].duration - (overlap || 0.9)
      return Array.from({length: Math.ceil(((overlap || 0.9) + 0.18) * 60)}, (_, i) => {
        const time = start - 0.065 + i / 60
        renderFrame(ctx, project, time)
        sampler.drawImage(canvas, 0, 0, 270, 480)
        const pixels = sampler.getImageData(0, 55, 270, 367).data
        let count = 0, sumX = 0, sumY = 0, minX = 270, maxX = 0
        for (let j = 0; j < pixels.length; j += 4) {
          const [r, g, b] = [pixels[j], pixels[j + 1], pixels[j + 2]]
          if (!(r >= 120 && r < 165 && g >= 176 && b >= 216 || r >= 221 && g >= 129 && g <= 168 && b >= 93 && b <= 130)) continue
          const x = (j / 4) % 270
          const y = Math.floor(j / 4 / 270)
          minX = Math.min(minX, x); maxX = Math.max(maxX, x)
          count++; sumX += x; sumY += y
        }
        return {count, x: sumX / count, y: sumY / count, width: maxX - minX}
      })
    })
  }, gaze)
  for (const run of review) {
    expect(Math.min(...run.map(frame => frame.count))).toBeGreaterThan(30)
    expect(Math.max(...run.map(frame => frame.width))).toBeLessThan(115)
    expect(Math.abs(run[0].y - run.at(-1)!.y)).toBeGreaterThan(42)
    const steps = run.slice(1).map((frame, i) => Math.hypot(frame.x - run[i].x, frame.y - run[i].y))
    expect(Math.max(...steps)).toBeLessThan(24)
  }
})


test('an overlapping incoming Reveal uses the same deadline on the real timeline', async ({page}) => {
  await page.goto('/')
  const samples = await page.evaluate(async ({gaze, rhythm}: {gaze: Document; rhythm: Document}) => {
    const {renderFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080; canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const paint = ctx.fillText.bind(ctx)
    let opacity = 0
    ctx.fillText = (text, x, y, maxWidth) => {
      if (text === 'пауза.') opacity = ctx.globalAlpha
      maxWidth === undefined ? paint(text, x, y) : paint(text, x, y, maxWidth)
    }
    const first = {...gaze.beats[0], placement: {overlap: 1}, transition: {type: 'Replace' as const}}
    const doc = {...gaze, beats: [first, rhythm.beats[0]]}
    const enters = first.duration - 1
    return [enters + 1.4, enters + 1.5, enters + 2.6].map(time => {
      opacity = 0
      renderFrame(ctx, doc, time)
      return opacity
    })
  }, {gaze, rhythm})
  expect(samples[0]).toBeLessThan(1)
  expect(samples.slice(1)).toEqual([1, 1])
})

for (const width of [320, 375, 390, 428, 1440]) {
  test(`timing and one-tap end preview fit at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: width === 320 ? 568 : 844})
    await page.goto('/')
    await upload(page, gaze)
    const transition = page.getByRole('button', {name: 'Transition', exact: true})
    await transition.click()
    await expect(page.locator('.live-time-badge')).toHaveText('End + next · real time')
    await expect(transition).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', {name: 'Pause live preview'}).click()
    await transition.click()
    await expect(page.getByRole('button', {name: 'Pause live preview'})).toBeVisible()
    await page.locator('.beat-card.selected + .beat-card').first().click()
    await expect(transition).toBeDisabled()
    await expect(page.getByRole('slider', {name: 'Reveal duration'})).toHaveValue('1.5')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}
