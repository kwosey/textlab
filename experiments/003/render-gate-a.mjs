import {bundle} from '@remotion/bundler'
import {renderStill, renderMedia, selectComposition} from '@remotion/renderer'
import {mkdir, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {performance} from 'node:perf_hooks'

const path = relative => fileURLToPath(new URL(relative, import.meta.url))
const output = path('./gate-a/')
const browserExecutable = process.env.CHROMIUM_PATH || '/usr/bin/chromium'
const start = performance.now()
const seconds = () => Math.round(performance.now() - start) / 1000
await mkdir(output, {recursive: true})
const serveUrl = await bundle({entryPoint: path('./src/index.jsx')})
const bundled = seconds()
const composition = await selectComposition({id: 'GateA', serveUrl, browserExecutable})
const stills = [['opening', 18], ['braking', 198], ['reveal', 344]]
const rendered = []
for (const [name, frame] of stills) {
  const began = seconds()
  await renderStill({composition, serveUrl, browserExecutable, frame, output: output + name + '.png'})
  rendered.push({name, frame, seconds: +(seconds() - began).toFixed(3)})
}
const frameRange = [153, 374]
const began = seconds()
await renderMedia({composition, serveUrl, browserExecutable, frameRange, codec: 'h264',
  outputLocation: output + 'preview.mp4', concurrency: 2, overwrite: true})
const timings = {width: composition.width, height: composition.height, fps: composition.fps,
  bundleSeconds: bundled, stills: rendered, preview: {frameRangeInclusive: frameRange, seconds: +(seconds() - began).toFixed(3)},
  totalSeconds: seconds()}
await writeFile(output + 'render-times.json', JSON.stringify(timings, null, 2) + '\n')
console.log(timings)
