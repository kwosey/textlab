import {bundle} from '@remotion/bundler'
import {selectComposition, renderMedia} from '@remotion/renderer'
import {fileURLToPath} from 'node:url'
import {writeFile} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import {geometry} from './src/projection.mjs'

const path = name => fileURLToPath(new URL(name, import.meta.url))
const browserExecutable = process.env.CHROMIUM_PATH || '/usr/bin/chromium'
const start = performance.now()
const since = t => +((performance.now()-t)/1000).toFixed(3)
const serveUrl = await bundle({entryPoint:path('./src/index.jsx')})
const bundleSeconds = since(start)
const composition = await selectComposition({serveUrl,browserExecutable,id:'ProsvetGateA'})
if (composition.width !== 540 || composition.height !== 960 ||
    composition.fps !== geometry.fps || composition.durationInFrames !== geometry.frames) {
  throw new Error('Unexpected Gate A composition metadata')
}
const opts = {composition,serveUrl,browserExecutable}
const began = performance.now()
await renderMedia({...opts,codec:'h264',outputLocation:path('./motion-proof.mp4'),concurrency:2,overwrite:true})
const report = {bundleSeconds,motionSeconds:since(began),totalSeconds:since(start)}
await writeFile(path('./render-times.json'),JSON.stringify(report,null,2)+'\n')
console.log(report)
