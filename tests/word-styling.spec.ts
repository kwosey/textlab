import {expect, test, type Page} from '@playwright/test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {decode, editStyle, editText, makeBeat, repairLinks, type Beat, type Document} from '../src/model'

const legacy = JSON.parse(await readFile(new URL('../examples/a-quiet-interval.json', import.meta.url), 'utf8')) as Document
const live = (page: Page) => page.locator('.live-preview canvas')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const frame = async (page: Page) => digest(await live(page).evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL()))
const words = (page: Page) => page.getByRole('group', {name: 'Choose words', exact: true})
const payload = (doc: Document) => ({name: 'textlab.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc))})
const fixture = (beats: Beat[]): Document => ({...legacy, title: 'Anchor checks', beats})
const makeAnchor = (beat: Beat, start: number, end: number, id: string) => ({
  ...beat, emphasis: [...beat.emphasis, {start, end, id, role: 'Anchor' as const}],
})

test('styles round-trip, survive intact edits, and split independently of roles', () => {
  const beat = makeBeat('слово 👩🏽‍🚀, blue')
  const emoji = {start: 6, end: 13}
  expect(beat.text.slice(emoji.start, emoji.end)).toBe('👩🏽‍🚀')
  beat.wordStyles = editStyle(beat, emoji, {color: 'Cool', marker: true})
  beat.wordStyles = editStyle(beat, {start: 13, end: beat.text.length}, {italic: true})
  const value = fixture([beat])
  expect(decode(JSON.parse(JSON.stringify(value)))).toEqual(value)
  const shifted = editText(beat, 'слово ' + beat.text, 6)
  expect(shifted.wordStyles?.[0].start).toBe(12)
  expect(shifted.text.slice(12, 19)).toBe('👩🏽‍🚀')
  const duplicate = makeBeat('echo echo')
  duplicate.wordStyles = [{start: 0, end: 4, style: {weight: 'Bold'}}]
  expect(editText(duplicate, 'echo echo echo', 5).wordStyles?.[0].start).toBe(5)
  expect(editText(beat, 'слово 👩‍🚀, blue').wordStyles?.map(run => run.style)).toEqual([{italic: true}])
  const invalid = {...beat, wordStyles: [{start: 7, end: 13, style: {marker: true}}]}
  expect(() => decode(fixture([invalid as Beat]))).toThrow()
  const broken = repairLinks(fixture([{...beat, transition: {type: 'Persist', from: 'missing', to: 'missing'}}, makeBeat('next')]))
  expect(broken.beats[0].transition).toEqual({type: 'Persist', broken: true})
})

test.describe('touch styling', () => {
  test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})

  test('selects a word and a phrase, draws each style live and round-trips exports', async ({page}) => {
    await page.goto('/')
    await page.locator('#beat-text').fill('Мысли, свет 👩🏽‍🚀\nblue water.')
    await page.getByRole('button', {name: 'Style words'}).tap()
    await words(page).getByRole('button', {name: 'Мысли', exact: true}).tap()
    await expect(words(page).getByRole('button', {name: 'Мысли'})).toHaveAttribute('aria-pressed', 'true')
    expect(await live(page).isVisible()).toBe(true)
    const original = await frame(page)
    for (const name of ['Cool', 'Bold', 'Marker', 'Italic', 'Strong']) {
      const previous = await frame(page)
      await page.getByRole('button', {name, exact: true}).tap()
      if (name !== 'Strong') expect(await frame(page)).not.toBe(previous)
    }
    await expect(live(page)).toBeInViewport()
    await page.getByRole('button', {name: 'Marker', exact: true}).tap()
    await page.getByRole('button', {name: 'Ink', exact: true}).tap()
    await page.getByRole('button', {name: 'Undo', exact: true}).tap()
    await expect(page.getByRole('button', {name: 'Cool', exact: true})).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', {name: 'Redo', exact: true}).tap()
    await expect(page.getByRole('button', {name: 'Ink', exact: true})).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', {name: 'Reset styling', exact: true}).tap()
    await expect(page.getByRole('button', {name: 'Strong', exact: true})).toHaveAttribute('aria-pressed', 'true')
    expect(await frame(page)).not.toBe(original)

    await page.getByRole('button', {name: 'Phrase', exact: true}).tap()
    await words(page).getByRole('button', {name: ',', exact: true}).tap()
    await words(page).getByRole('button', {name: '👩🏽‍🚀', exact: true}).tap()
    await expect(words(page).getByRole('button', {name: 'свет', exact: true})).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', {name: 'Marker', exact: true}).tap()
    await page.getByRole('button', {name: 'Subtle', exact: true}).tap()
    await page.getByRole('button', {name: 'Anchor', exact: true}).tap()
    const before = await frame(page)
    await page.getByRole('button', {name: 'Keep', exact: true}).tap()
    await page.getByRole('button', {name: 'Export', exact: true}).tap()
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export JSON'}).tap()])
    const doc = decode(JSON.parse(await readFile((await json.path())!, 'utf8')))
    const range = doc.beats[0].wordStyles?.[0]
    expect(range && doc.beats[0].text.slice(range.start, range.end)).toBe(', свет 👩🏽‍🚀')
    expect(doc.beats[0].emphasis.map(mark => mark.role)).toEqual(['Strong', 'Anchor'])
    await page.reload()
    expect(await frame(page)).toBe(before)
    await page.getByLabel('Import document').setInputFiles(payload(doc))
    expect(await frame(page)).toBe(before)
    await page.getByRole('button', {name: 'Compose', exact: true}).tap()
    const canvas = page.locator('#full-preview canvas')
    const drawn = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())
    await page.getByRole('button', {name: 'Export', exact: true}).tap()
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Export current PNG'}).tap()])
    const bytes = await readFile((await png.path())!)
    expect(digest('data:image/png;base64,' + bytes.toString('base64'))).toBe(digest(drawn))
  })
})

test('suggestions require confirmation and a damaged link is visible and removable', async ({page}) => {
  await page.goto('/')
  const outgoing = makeAnchor(makeBeat('The tide comes in', {transition: {type: 'Persist'}}), 4, 8, 'outgoing')
  const incoming = makeAnchor(makeBeat('A tide goes out'), 2, 6, 'incoming')
  await page.getByLabel('Import document').setInputFiles(payload(fixture([outgoing, incoming])))
  await expect(page.getByRole('button', {name: /Link suggested pair/})).toHaveCount(1)
  await expect(page.locator('.anchor-card')).toHaveCount(0)
  await page.getByRole('button', {name: /Link suggested pair/}).click()
  await expect(page.locator('.anchor-card')).toContainText('Beat 01')
  await expect(page.locator('.anchor-card')).toContainText('Beat 02')
  await expect(page.locator('.anchor-card')).toContainText('Linked')
  await expect(page.getByRole('group', {name: 'Preview mode'}).getByRole('button', {name: 'Transition'})).toHaveAttribute('aria-pressed', 'true')
  const previous = await frame(page)
  await expect.poll(() => frame(page)).not.toBe(previous)
  await page.locator('#beat-text').fill('The wave comes in')
  await expect(page.getByText('Link broken.', {exact: false})).toBeVisible()
  await expect(page.locator('.anchor-card')).toHaveCount(0)
  await page.getByRole('button', {name: 'Undo', exact: true}).click()
  await expect(page.locator('.anchor-card')).toContainText('tide')
  await page.getByRole('button', {name: 'Remove link'}).click()
  await expect(page.locator('.anchor-card')).toHaveCount(0)
  await expect(page.getByRole('button', {name: /Link suggested pair/})).toBeVisible()
})

test('offers contextual alternatives and links two exact manually selected passages', async ({page}) => {
  await page.goto('/')
  const outgoing = makeAnchor(makeAnchor(makeBeat('tide in, tide out', {transition: {type: 'Persist'}}), 0, 4, 'a'), 9, 13, 'b')
  const incoming = makeAnchor(makeBeat('tide by moonlight'), 0, 4, 'c')
  await page.getByLabel('Import document').setInputFiles(payload(fixture([outgoing, incoming])))
  await expect(page.getByRole('button', {name: /Link matching pair/})).toHaveCount(2)
  await expect(page.getByRole('button', {name: /Link matching pair/}).last()).toContainText('in, tide out')
  const a = makeBeat('Loud tide moves', {transition: {type: 'Persist'}, wordStyles: [{start: 5, end: 9, style: {marker: true}}]})
  const b = makeBeat('Still tide waits')
  await page.getByLabel('Import document').setInputFiles(payload(fixture([a, b])))
  await expect(page.getByText('No matching Anchors.', {exact: false})).toBeVisible()
  await page.getByRole('button', {name: 'Choose passages manually'}).click()
  const out = page.getByRole('group', {name: 'Outgoing · Beat 01'})
  const incomingWords = page.getByRole('group', {name: 'Incoming · Beat 02'})
  await out.getByRole('button', {name: 'tide'}).click()
  await incomingWords.getByRole('button', {name: 'Still'}).click()
  await expect(page.getByRole('button', {name: 'Link selected passages'})).toBeDisabled()
  await incomingWords.getByRole('button', {name: 'tide'}).click()
  await page.getByRole('button', {name: 'Link selected passages'}).click()
  await expect(page.locator('.anchor-card')).toContainText('tide')
  await expect(page.locator('.anchor-card')).not.toContainText(/\d+\s*→\s*\d+/)
  const stored = decode(await page.evaluate(() => JSON.parse(localStorage.getItem('textlab:draft:v1')!)))
  expect(stored.beats[0].wordStyles).toEqual(a.wordStyles)
  expect(stored.beats.every(beat => beat.emphasis.some(mark => mark.role === 'Anchor'))).toBe(true)
  await page.getByRole('button', {name: 'Change link'}).click()
  await expect(page.getByRole('button', {name: 'Choose passages manually'})).toBeVisible()
})

for (const [width, height] of [[320, 568], [375, 812], [390, 844], [428, 926], [1440, 900]]) {
  test.describe(`word picker at ${width}px`, () => {
    test.use({viewport: {width, height}, isMobile: width < 500, hasTouch: width < 500})
    test('keeps Unicode controls and styling inside the viewport', async ({page}) => {
      await page.goto('/')
      await page.locator('#beat-text').fill('Сверхдлинноеслово'.repeat(10) + '\n👩🏽‍🚀, bilingual text')
      await page.getByRole('button', {name: 'Style words'}).click()
      const emoji = words(page).getByRole('button', {name: '👩🏽‍🚀', exact: true})
      await emoji.focus()
      await emoji.press('ArrowRight')
      const comma = words(page).getByRole('button', {name: ',', exact: true})
      await expect(comma).toBeFocused()
      await comma.press('Space')
      await expect(comma).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', {name: 'Marker', exact: true}).click()
      await expect(live(page)).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    })
  })
}

test('styled Reveal, Focus and Transform remain deterministic on both canvases', async ({page}) => {
  await page.goto('/')
  const beat = makeBeat('Мысли ждут,\nblue 👩🏽‍🚀 water waits.', {
    reveal: 'Words',
    wordStyles: [{start: 0, end: 10, style: {color: 'Cool', weight: 'Bold', italic: true, marker: true}}],
    emphasis: [{start: 0, end: 5, id: 'focus', role: 'Strong'}],
    effect: 'Wave',
  })
  const measurements = await page.evaluate(async (doc: Document) => {
    const {renderFrame, renderLabFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
    const {createLayout, lab}: typeof import('../src/layout') = await import('/src/layout.ts' as string)
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')!
    const comparison: boolean[] = []
    for (const theme of ['Paper', 'Moss', 'Night', 'Lilac'] as const) {
      for (const mode of ['Reveal', 'Focus', 'Transform'] as const) {
        const styled = {...doc.beats[0], mode}
        const value = {...doc, theme, beats: [styled]}
        const plain = {...value, beats: [{...styled, wordStyles: undefined}]}
        renderLabFrame(ctx, value, 0, 0.61, false)
        const frame = canvas.toDataURL()
        renderLabFrame(ctx, plain, 0, 0.61, false)
        comparison.push(canvas.toDataURL() !== frame)
        renderLabFrame(ctx, value, 0, 0.04, false)
        renderLabFrame(ctx, value, 0, 0.61, false)
        comparison.push(canvas.toDataURL() === frame)
        renderFrame(ctx, value, 2.3)
        const reel = canvas.toDataURL()
        renderFrame(ctx, plain, 2.3)
        comparison.push(canvas.toDataURL() !== reel)
      }
    }
    return {comparison, wraps: createLayout(ctx, doc.beats[0], lab).lines}
  }, fixture([beat]))
  expect(measurements.comparison).not.toContain(false)
  expect(measurements.wraps).toBeGreaterThanOrEqual(2)
})

test('a running Reveal applies the chosen color on the next visible frame', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('/')
  await page.locator('#beat-text').fill('Мысли освещают тихую воду.')
  await page.getByRole('group', {name: 'Presentation mode'}).getByRole('button', {name: 'Reveal'}).click()
  await page.getByRole('button', {name: 'Style words'}).click()
  await words(page).getByRole('button', {name: 'Мысли', exact: true}).click()
  const hasCoolInk = () => live(page).evaluate(node => {
    const canvas = node as HTMLCanvasElement
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] === 36 && rgba[i + 1] === 87 && rgba[i + 2] === 131) return true
    }
    return false
  })
  expect(await hasCoolInk()).toBe(false)
  await page.getByRole('button', {name: 'Cool', exact: true}).click()
  expect(await hasCoolInk()).toBe(true)
  await expect(page.getByRole('button', {name: 'Pause live preview'})).toBeVisible()
  await expect(live(page)).toBeInViewport()
})
