import {bundle} from '@remotion/bundler'
import {selectComposition, renderStill, renderMedia} from '@remotion/renderer'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'

const mode = process.argv[2] ?? 'all'
if (!['all','stills','motion'].includes(mode)) throw new Error('Expected stills, motion or all')
const path = name => fileURLToPath(new URL(name, import.meta.url))
const t0 = performance.now()
let mark = t0
function elapsed(label) {
  const now = performance.now()
  console.log(`${label}: ${((now-mark)/1000).toFixed(3)} s`)
  mark = now
}
const serveUrl = await bundle({entryPoint:path('./src/index.jsx')})
const opts = {serveUrl, browserExecutable:process.env.CHROMIUM_PATH || '/usr/bin/chromium'}
elapsed('Bundle')
await mkdir(path('./stills/'), {recursive:true})
if (mode !== 'motion') {
  for (const [i, name] of ['type','aperture','depth'].entries()) {
    for (let phase=1;phase<=3;phase++) {
      const composition=await selectComposition({...opts,id:`Study-${i+1}-${phase}`})
      await renderStill({...opts,composition,frame:0,output:path(`./stills/${name}-${phase}.png`)})
      elapsed(`Still ${name}-${phase}`)
    }
  }
}
if (mode !== 'stills') {
  const composition=await selectComposition({...opts,id:'MotionProof'})
  await renderMedia({...opts,composition,codec:'h264',outputLocation:path('./motion-proof.mp4'),concurrency:2,overwrite:true})
  elapsed('Motion select + render + encode')
}
console.log(`Total: ${((performance.now()-t0)/1000).toFixed(3)} s`)
