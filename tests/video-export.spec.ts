import {expect, test, type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {decode, type Document} from '../src/model'
import {frameTiming, videoFilename} from '../src/video-export'
import {beatStart, totalTime, transitionSpan} from '../src/timeline'

const fixture = decode(JSON.parse(await readFile(new URL('../examples/video-export-check.json', import.meta.url), 'utf8')))
const panel = (page: Page) => page.getByRole('region', {name: 'Video export'})
const menu = (page: Page) => page.getByRole('button', {name: 'Export', exact: true})
const action = (page: Page) => page.getByRole('button', {name: 'Export video', exact: true})
async function start(page: Page) {
  await menu(page).click()
  await action(page).click()
}
async function upload(page: Page, doc: Document) {
  await page.getByLabel('Import document').setInputFiles({
    name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.locator('#composition-title')).toHaveValue(doc.title)
}

test('frame timing starts at zero, ends on the duration and names are file-safe', () => {
  const duration = totalTime(fixture)
  const count = Math.ceil(duration * 30)
  const ends = Array.from({length: count}, (_, index) => frameTiming(index, duration))
  expect(ends[0].stamp).toBe(0)
  expect(ends.at(-1)!.start).toBeLessThan(duration)
  expect(ends.at(-1)!.stamp + ends.at(-1)!.length).toBe(Math.round(duration * 1e6))
  expect(ends.slice(1).every((sample, index) => ends[index].stamp + ends[index].length === sample.stamp)).toBe(true)
  expect(videoFilename(' /Круг: новый?  ', 'mp4')).toBe('Круг-новый.mp4')
  expect(videoFilename('CON', 'webm')).toBe('text-lab.webm')
})

for (const fallback of [false, true]) {
  test(`exports a decodable ${fallback ? 'WebM when AVC is unavailable' : 'video with overlap'}, preserving sampled renderer pixels`, async ({page}) => {
    test.setTimeout(110000)
    if (fallback) await page.setViewportSize({width: 390, height: 844})
    if (fallback) await page.addInitScript(() => {
      const support = VideoEncoder.isConfigSupported.bind(VideoEncoder)
      VideoEncoder.isConfigSupported = config => config.codec.startsWith('avc')
        ? Promise.resolve({supported: false, config}) : support(config)
    })
    if (!fallback) await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {value: ({files}: ShareData) => files?.length === 1})
      Object.defineProperty(navigator, 'share', {value: async ({files}: ShareData) => {
        const file = files?.[0]
        document.documentElement.dataset.sharedVideo = file ? file.name + ':' + file.type : ''
      }})
    })
    await page.goto('/')
    const doc = fallback ? {...fixture, beats: fixture.beats.map(beat => ({...beat, placement: {...beat.placement, overlap: 0}}))} : fixture
    await upload(page, doc)
    await start(page)
    const link = panel(page).getByRole('link', {name: 'Download video'})
    await expect(link).toBeVisible({timeout: 90000})
    const fileName = await link.getAttribute('download')
    expect(await link.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    if (fallback) {
      expect(fileName).toMatch(/\.webm$/)
      await expect(panel(page)).toContainText('Instagram may require MP4')
    }
    const duration = totalTime(doc)
    const times = [0, 0.43, 0.77, ...doc.beats.slice(0, -1).map((beat, i) => {
      return beatStart(doc, i) + beat.duration - transitionSpan(beat, doc.beats[i + 1]) * 0.48
    }), duration - 0.001]
    const inspection = await page.evaluate(async ({doc, times}) => {
      const {ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSampleSink}: typeof import('mediabunny') =
        await import('/tests/video-probe.ts' as string)
      const {renderFrame}: typeof import('../src/render') = await import('/src/render.ts' as string)
      const blob = await (await fetch(document.querySelector<HTMLAnchorElement>('.video-export-panel a')!.href)).blob()
      const head = [...new Uint8Array(await blob.slice(0, 12).arrayBuffer())]
      const input = new Input({source: new BlobSource(blob), formats: ALL_FORMATS})
      try {
        const track = (await input.getPrimaryVideoTrack())!
        const points: number[] = []
        for await (const item of new EncodedPacketSink(track).packets()) points.push(item.timestamp)
        const reference = document.createElement('canvas')
        reference.width = 1080; reference.height = 1920
        const ctx = reference.getContext('2d')!
        const sample = document.createElement('canvas')
        sample.width = 135; sample.height = 240
        const low = sample.getContext('2d', {willReadFrequently: true})!
        const errors: number[] = []
        const indexes: number[] = []
        for await (const frame of new VideoSampleSink(track).samplesAtTimestamps(times)) {
          if (!frame) throw new Error('No decodable video frame.')
          const index = Math.round(frame.timestamp * 30)
          indexes.push(index)
          frame.draw(low, 0, 0, sample.width, sample.height)
          frame.close()
          const observed = low.getImageData(0, 0, sample.width, sample.height).data
          renderFrame(ctx, doc, index / 30)
          low.drawImage(reference, 0, 0, sample.width, sample.height)
          const expected = low.getImageData(0, 0, sample.width, sample.height).data
          let sum = 0
          for (let i = 0; i < expected.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(observed[i + c] - expected[i + c])
          errors.push(sum / (expected.length / 4 * 3))
        }
        return {type: blob.type, head, size: blob.size, width: await track.getDisplayWidth(), height: await track.getDisplayHeight(),
          codec: await track.getCodec(), duration: await input.computeDuration(), audio: (await input.getAudioTracks()).length,
          points, errors, indexes}
      } finally {
        input.dispose()
      }
    }, {doc, times})
    const count = Math.ceil(duration * 30)
    expect(inspection.audio).toBe(0)
    expect(inspection.width).toBe(1080)
    expect(inspection.height).toBe(1920)
    expect(inspection.size).toBeGreaterThan(1024)
    expect(inspection.type).toBe(fileName?.endsWith('.mp4') ? 'video/mp4' : 'video/webm')
    if (inspection.type === 'video/mp4') {
      expect(inspection.codec).toBe('avc')
      expect(inspection.head.slice(4, 8)).toEqual([102, 116, 121, 112])
    } else {
      expect(['vp8', 'vp9']).toContain(inspection.codec)
      expect(inspection.head.slice(0, 4)).toEqual([26, 69, 223, 163])
    }
    expect(Math.abs(inspection.duration - duration)).toBeLessThanOrEqual(1 / 30)
    expect(inspection.points).toHaveLength(count)
    expect(inspection.points.every((value, i) => Math.abs(value - i / 30) < 0.0011)).toBe(true)
    expect(inspection.indexes[0]).toBe(0)
    expect(inspection.indexes.at(-1)).toBe(count - 1)
    expect(inspection.errors.length).toBe(times.length)
    expect(Math.max(...inspection.errors)).toBeLessThan(9)
    if (!fallback) {
      await panel(page).getByRole('button', {name: 'Share file'}).click()
      expect(await page.locator('html').getAttribute('data-shared-video')).toBe(fileName + ':' + inspection.type)
    }
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
    expect(download.suggestedFilename()).toBe(fileName)
    expect((await readFile((await download.path())!)).length).toBe(inspection.size)
  })
}

test('slow encoding reports a bounded queue and cancels without document or playhead changes', async ({page}) => {
  await page.addInitScript(() => {
    const flush = VideoEncoder.prototype.flush
    const encode = VideoEncoder.prototype.encode
    const counters = {peak: 0}
    Object.defineProperty(window, 'videoCounters', {value: counters})
    VideoEncoder.prototype.encode = function(frame, options) {
      encode.call(this, frame, options)
      counters.peak = Math.max(counters.peak, this.encodeQueueSize)
    }
    VideoEncoder.prototype.flush = async function() {
      await flush.call(this)
      await new Promise(resolve => setTimeout(resolve, 180))
    }
  })
  await page.goto('/')
  await upload(page, fixture)
  await page.getByRole('button', {name: 'Compose', exact: true}).click()
  await page.getByRole('slider', {name: 'Scrub time'}).press('End')
  const stamp = await page.locator('.timecode').innerText()
  const draft = () => page.evaluate(() => localStorage.getItem('textlab:draft:v1'))
  const before = await draft()
  await start(page)
  await expect.poll(async () => Number(await panel(page).getByRole('progressbar').getAttribute('value'))).toBeGreaterThan(0)
  await menu(page).click()
  await expect(action(page)).toBeDisabled()
  await panel(page).getByRole('button', {name: 'Cancel', exact: true}).click()
  await expect(panel(page)).toContainText('Video export cancelled.')
  await expect(panel(page).getByRole('link')).toHaveCount(0)
  expect(await draft()).toBe(before)
  await expect(page.locator('.timecode')).toHaveText(stamp)
  expect(await page.evaluate(() => (window as unknown as {videoCounters: {peak: number}}).videoCounters.peak)).toBeLessThanOrEqual(8)
  await expect(action(page)).toBeEnabled()
})

test('encoder errors and unsupported browsers produce a clear message and no file', async ({page}) => {
  await page.goto('/')
  await page.evaluate(() => {
    VideoEncoder.prototype.encode = () => {throw new DOMException('encoder failure', 'EncodingError')}
  })
  await start(page)
  await expect(panel(page)).toContainText('could not finish encoding')
  await expect(panel(page).getByRole('link')).toHaveCount(0)
  await page.evaluate(() => {VideoEncoder.isConfigSupported = async config => ({config, supported: false})})
  await start(page)
  await expect(panel(page)).toContainText('No supported H.264, VP8 or VP9 encoder')
  await expect(panel(page).getByRole('link')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('textlab:draft:v1'))).toBeNull()
})

for (const width of [320, 375, 390, 428, 1440]) {
  test(`local video export panel fits at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 844})
    await page.addInitScript(() => {VideoEncoder.isConfigSupported = () => new Promise(() => {})})
    await page.goto('/')
    await start(page)
    await expect(panel(page).getByRole('button', {name: 'Cancel'})).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await panel(page).getByRole('button', {name: 'Cancel'}).click()
    await expect(panel(page)).toContainText('Video export cancelled.')
  })
}
