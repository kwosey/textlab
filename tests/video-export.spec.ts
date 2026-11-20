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
      await new Promise(resolve => setTimeout(resolve, 1200))
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

test('iPhone Safari negotiation reports a private failure and retries the 15s demo as playable 720p MP4', async ({browser}, testInfo) => {
  test.setTimeout(110000)
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  })
  try {
    await context.addInitScript(() => {
      const probe = VideoEncoder.isConfigSupported.bind(VideoEncoder)
      const configure = VideoEncoder.prototype.configure
      VideoEncoder.isConfigSupported = config => config.codec === 'avc1.42e028'
        ? Promise.resolve({supported: true, config})
        : config.width === 720 && config.codec.startsWith('avc') ? probe(config)
          : Promise.resolve({supported: false, config})
      VideoEncoder.prototype.configure = function(config) {
        if (config.width === 1080) throw new DOMException('Hardware unavailable PRIVATE_PROJECT_TEXT', 'OperationError')
        configure.call(this, config)
      }
      Object.defineProperty(navigator, 'clipboard', {value: {writeText: async (value: string) => {
        document.documentElement.dataset.copied = value
      }}})
    })
    const page = await context.newPage()
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    await expect(page.locator('#composition-title')).toHaveValue('A Quiet Interval')
    await start(page)
    await expect(panel(page)).toContainText('encoder configure')
    await panel(page).getByText('Export diagnostics').click()
    const report = panel(page).getByRole('textbox', {name: 'Diagnostic report'})
    await expect(report).toHaveValue(/Safari 18\.6.*CPU iPhone OS 18\.6/)
    await expect(report).toHaveValue(/1080 × 1920, 30 fps; 450 frames/)
    await expect(report).toHaveValue(/avc1\.42e028 \/ quality .* failed at encoder configure; support: true/)
    await expect(report).toHaveValue(/OperationError: The browser reported unavailable codec resources/)
    await expect(report).not.toHaveValue(/PRIVATE_PROJECT_TEXT|A Quiet Interval/)
    const diagnostic = await report.inputValue()
    await panel(page).getByRole('button', {name: 'Copy diagnostics'}).click()
    await expect(page.locator('html')).toHaveAttribute('data-copied', diagnostic)
    await panel(page).getByRole('button', {name: 'Retry at 720p'}).click()
    const downloadLink = panel(page).getByRole('link', {name: 'Download video'})
    await expect(downloadLink).toHaveAttribute('download', /\.mp4$/, {timeout: 90000})
    await expect(panel(page)).toContainText('720 × 1280 · 30 fps')
    await panel(page).getByRole('button', {name: 'Preview video'}).click()
    const video = panel(page).locator('video')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight, element.duration])).toEqual([720, 1280, 15])
    await video.evaluate((element: HTMLVideoElement) => element.play())
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1)
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()])
    await download.saveAs(testInfo.outputPath('a-quiet-interval-720p.mp4'))
    await video.dispatchEvent('error', {bubbles: false})
    await expect(panel(page).getByRole('alert')).toContainText('Playback failed')
    if (!await report.isVisible()) await panel(page).getByText('Export diagnostics').click()
    await expect(report).toHaveValue(/browser playback.*MediaError/)
    await expect(report).toHaveValue(/submitted\/encoded\/muxed: 450\/450\/450/)
  } finally {
    await context.close()
  }
})

for (const stage of ['create VideoFrame', 'encoder flush'] as const) {
  test(`reports a failure at ${stage} with frame counters`, async ({page}) => {
    await page.addInitScript(failureStage => {
      const probe = VideoEncoder.isConfigSupported.bind(VideoEncoder)
      VideoEncoder.isConfigSupported = config => config.codec === 'vp8' ? probe(config)
        : Promise.resolve({supported: false, config})
      if (failureStage === 'create VideoFrame') {
        globalThis.VideoFrame = new Proxy(VideoFrame, {
          construct() {throw new DOMException('Frame constructor failed', 'OperationError')},
        })
      } else {
        VideoEncoder.prototype.flush = () => Promise.reject(new DOMException('encoder failure', 'EncodingError'))
      }
    }, stage)
    await page.goto('/')
    await start(page)
    await expect(panel(page)).toContainText(stage, {timeout: 45000})
    await panel(page).getByText('Export diagnostics').click()
    const report = panel(page).getByRole('textbox', {name: 'Diagnostic report'})
    await expect(report).toHaveValue(stage === 'create VideoFrame'
      ? /failed at create VideoFrame; support: true; submitted\/encoded\/muxed: 0\/0\/0.*OperationError/
      : /failed at encoder flush; support: true; submitted\/encoded\/muxed: [1-9]\d*\/\d+\/\d+.*EncodingError/)
    await expect(panel(page).getByRole('link', {name: 'Download video'})).toHaveCount(0)
  })
}

for (const scenario of [
  {resolution: '1080p', mode: 'rounded', firstKeyOnly: false},
  {resolution: '720p', mode: 'rounded', firstKeyOnly: false},
  {resolution: '720p', mode: 'rounded', firstKeyOnly: true},
  {resolution: '720p', mode: 'duplicate', firstKeyOnly: false},
  {resolution: '720p', mode: 'empty', firstKeyOnly: false},
  {resolution: '720p', mode: 'unexpected', firstKeyOnly: false},
  {resolution: '720p', mode: 'missing', firstKeyOnly: false},
] as const) {
  test(`packet 121: ${scenario.mode} at ${scenario.resolution}, first-key-only=${scenario.firstKeyOnly}`, async ({page}) => {
    test.setTimeout(75000)
    await page.addInitScript(({mode, firstKeyOnly}) => {
      const NativeEncoder = VideoEncoder
      const probe = NativeEncoder.isConfigSupported.bind(NativeEncoder)
      const encode = NativeEncoder.prototype.encode
      NativeEncoder.isConfigSupported = config => config.codec === 'avc1.42e028' || config.codec === 'avc1.42e01f'
        ? probe(config) : Promise.resolve({supported: false, config})
      NativeEncoder.prototype.encode = function(frame, options) {
        encode.call(this, frame, firstKeyOnly && frame.timestamp !== 0 ? {keyFrame: false} : options)
      }
      globalThis.VideoEncoder = new Proxy(NativeEncoder, {
        construct(Target, [init]: [VideoEncoderInit]) {
          return new Target({...init, output(chunk, metadata) {
            if (chunk.timestamp !== 4033333) return init.output(chunk, metadata)
            if (mode === 'missing') return
            const data = new Uint8Array(chunk.byteLength)
            chunk.copyTo(data)
            const timestamp = mode === 'rounded' ? 4033000 : mode === 'duplicate' ? 4000000
              : mode === 'unexpected' ? 4032332 : chunk.timestamp
            init.output(new EncodedVideoChunk({timestamp, type: chunk.type, duration: chunk.duration ?? undefined,
              data: mode === 'empty' ? new Uint8Array() : data}), metadata)
          }})
        },
      })
    }, scenario)
    await page.goto('/')
    const result = await page.evaluate(async resolution => {
      const {exportVideo}: typeof import('../src/video-export') = await import('/src/video-export.ts' as string)
      const {demos}: typeof import('../src/demos') = await import('/src/demos.ts' as string)
      const {diagnosticText, VideoExportError}: typeof import('../src/video-diagnostics') =
        await import('/src/video-diagnostics.ts' as string)
      try {
        const {file, diagnostics} = await exportVideo(demos[0], new AbortController().signal, () => {}, resolution)
        const {ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSampleSink}: typeof import('mediabunny') =
          await import('/tests/video-probe.ts' as string)
        const input = new Input({source: new BlobSource(file), formats: ALL_FORMATS})
        try {
          const track = (await input.getPrimaryVideoTrack())!
          const timestamps: number[] = []
          for await (const packet of new EncodedPacketSink(track).packets()) timestamps.push(packet.timestamp)
          const decoded: number[] = []
          for await (const sample of new VideoSampleSink(track).samplesAtTimestamps([4, 121 / 30 + 0.001, 14.99])) {
            if (!sample) throw new Error('Missing decoded sample')
            decoded.push(Math.round(sample.timestamp * 30))
            sample.close()
          }
          return {report: diagnosticText(diagnostics), timestamps, duration: await input.computeDuration(), decoded}
        } finally {
          input.dispose()
        }
      } catch (error) {
        if (!(error instanceof VideoExportError)) throw error
        return {report: diagnosticText(error.diagnostics)}
      }
    }, scenario.resolution)
    if (scenario.mode === 'rounded') {
      expect(result.report).toContain('Corrected timestamps: 1. First: timestamp corrected: PTS 4033000 µs')
      expect(result.report).toContain('matched frame 121; exact pending false')
      expect(result.report).toContain('intended PTS 4033333 µs')
      expect(result.report).toContain('last requested keyframe 120')
      expect(result.timestamps).toHaveLength(450)
      expect(result.timestamps?.every((timestamp, i) => Math.abs(timestamp - i / 30) < 0.00001)).toBe(true)
      expect(result.duration).toBe(15)
      expect(result.decoded).toEqual([120, 121, 449])
    } else {
      expect(result.timestamps).toBeUndefined()
      const descriptions = {
        duplicate: /duplicate frame: PTS 4000000 .* matched frame 120; exact pending false; prior packets for timestamp\/frame 1/,
        empty: /empty packet: PTS 4033333 .* 0 bytes; .* matched frame 121; exact pending true/,
        unexpected: /unexpected timestamp: PTS 4032332 .* matched frame none; exact pending false/,
        missing: /Missing packet PTS \[4033333\]/,
      }
      expect(result.report).toMatch(descriptions[scenario.mode])
    }
  })
}
