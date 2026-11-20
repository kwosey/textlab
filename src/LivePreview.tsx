import {useLayoutEffect, useRef, useState} from 'react'
import {Pause, Play, RotateCcw, Shuffle} from 'lucide-react'
import {HEIGHT, LAB_HEIGHT, WIDTH} from './layout'
import {themes, type Document} from './model'
import {renderLabFrame} from './render'
import {transitionPreviewRange} from './timeline'

export function LivePreview({doc, index, active, transition, onMode, restart, onMutate, cuePreview}: {
  doc: Document; index: number; active: boolean; transition: boolean
  onMode: (transition: boolean) => void; restart: number; onMutate: () => void; cuePreview: {time: number} | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const phase = useRef(0)
  const exactTime = useRef<number | undefined>(undefined)
  const [vertical, setVertical] = useState(false)
  const [playing, setPlaying] = useState(true)
  const latest = useRef({doc, index, transition})
  const beat = doc.beats[index]
  const explicit = (beat.mode === 'Reveal' && !!beat.timing) || !!beat.cues?.length || vertical
  const handoff = transitionPreviewRange(doc, index)
  const cycle = transition ? Math.max(0.1, handoff.finish - handoff.start) : explicit ? beat.duration : Math.min(4, beat.duration)
  const canTransition = index + 1 < doc.beats.length

  useLayoutEffect(() => {
    latest.current = {doc, index, transition}
    const context = canvas.current?.getContext('2d')
    if (active && context) renderLabFrame(context, doc, index, phase.current, transition, vertical, exactTime.current)
  }, [active, doc, index, transition, vertical])
  useLayoutEffect(() => {
    phase.current = 0
    exactTime.current = undefined
    const context = canvas.current?.getContext('2d')
    if (active && context) renderLabFrame(context, latest.current.doc, index, 0, transition, vertical)
  }, [index, restart, transition])
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!active || !playing || !context) return
    let frame: number
    let previous = performance.now()
    function draw(now: number) {
      exactTime.current = undefined
      phase.current = (phase.current + Math.max(0, now - previous) / (cycle * 1000)) % 1
      previous = now
      const current = latest.current
      renderLabFrame(context!, current.doc, current.index, phase.current, current.transition, vertical)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active, cycle, playing, vertical])
  useLayoutEffect(() => {
    if (restart) setPlaying(true)
  }, [restart])

  useLayoutEffect(() => {
    if (!cuePreview) return
    exactTime.current = cuePreview.time
    phase.current = Math.min(1, cuePreview.time / latest.current.doc.beats[latest.current.index].duration)
    const context = canvas.current?.getContext('2d')
    if (context) renderLabFrame(context, latest.current.doc, latest.current.index, phase.current, false, vertical, exactTime.current)
    setPlaying(false)
  }, [cuePreview])

  function replay() {
    phase.current = 0
    exactTime.current = undefined
    const context = canvas.current?.getContext('2d')
    if (context) renderLabFrame(context, doc, index, 0, transition, vertical)
    setPlaying(true)
  }

  return <section className="live-preview" aria-label="Live preview">
    <div className="live-controls">
      <span className="live-heading"><span className="live-dot"/> Live preview</span>
      <div className="live-modes" role="group" aria-label="Preview mode">
        <button aria-pressed={!transition} onClick={() => {onMode(false); setPlaying(true)}}>Beat</button>
        <button aria-pressed={transition} disabled={!canTransition} title={canTransition ? 'Play the end of this Beat and the start of the next' : 'No following Beat'}
          onClick={() => {if (transition) replay(); else {onMode(true); setPlaying(true)}}}>Transition</button>
      </div>
      <div className="live-transport">
        <button aria-label={playing ? 'Pause live preview' : 'Play live preview'} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={15}/> : <Play size={15}/>}
        </button>
        <button aria-label="Restart live preview" onClick={replay}><RotateCcw size={15}/></button>
        <button className="live-mutate" aria-label="Mutate" title="Mutate" onClick={onMutate}><Shuffle size={15}/><span>Mutate</span></button>
      </div>
    </div>
    <div className={vertical ? "live-canvas-wrap vertical-proof" : "live-canvas-wrap"}>
    <canvas ref={canvas} width={WIDTH} height={vertical ? HEIGHT : LAB_HEIGHT} style={{background: themes[doc.theme][0]}} aria-label={transition ? 'Two-beat transition frame' : 'Selected beat frame'}/>
      <button className="proof-toggle" aria-label="9:16 proof" aria-pressed={vertical} onClick={() => setVertical(!vertical)}>{vertical ? "Wide" : "9:16"}</button>
      {(explicit || transition) && <span className="live-time-badge">{transition ? 'End + next · real time' : 'Real time'}</span>}
    </div>
  </section>
}
