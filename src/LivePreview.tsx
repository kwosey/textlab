import {useLayoutEffect, useRef, useState} from 'react'
import {Pause, Play, RotateCcw, Shuffle} from 'lucide-react'
import {LAB_HEIGHT, WIDTH} from './layout'
import {themes, type Document} from './model'
import {renderLabFrame} from './render'

export function LivePreview({doc, index, active, transition, onMode, restart, onMutate}: {
  doc: Document; index: number; active: boolean; transition: boolean
  onMode: (transition: boolean) => void; restart: number; onMutate: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const phase = useRef(0)
  const [playing, setPlaying] = useState(true)
  const latest = useRef({doc, index, transition})
  const beat = doc.beats[index]
  const cycle = transition ? 2.8 : Math.max(0.5, Math.min(4, beat.duration))
  const canTransition = index + 1 < doc.beats.length

  useLayoutEffect(() => {
    latest.current = {doc, index, transition}
    const context = canvas.current?.getContext('2d')
    if (active && context) renderLabFrame(context, doc, index, phase.current, transition)
  }, [active, doc, index, transition])
  useLayoutEffect(() => {
    phase.current = 0
    const context = canvas.current?.getContext('2d')
    if (active && context) renderLabFrame(context, latest.current.doc, index, 0, transition)
  }, [index, restart, transition])
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!active || !playing || !context) return
    let frame: number
    let previous = performance.now()
    function draw(now: number) {
      phase.current = (phase.current + Math.max(0, now - previous) / (cycle * 1000)) % 1
      previous = now
      const current = latest.current
      renderLabFrame(context!, current.doc, current.index, phase.current, current.transition)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active, cycle, playing])
  useLayoutEffect(() => {
    if (restart) setPlaying(true)
  }, [restart])

  return <section className="live-preview" aria-label="Live preview">
    <div className="live-controls">
      <span className="live-heading"><span className="live-dot"/> Live preview</span>
      <div className="live-modes" role="group" aria-label="Preview mode">
        <button aria-pressed={!transition} onClick={() => {onMode(false); setPlaying(true)}}>Beat</button>
        <button aria-pressed={transition} disabled={!canTransition} title={!canTransition ? 'No following beat' : undefined}
          onClick={() => {onMode(true); setPlaying(true)}}>Transition</button>
      </div>
      <div className="live-transport">
        <button aria-label={playing ? 'Pause live preview' : 'Play live preview'} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={15}/> : <Play size={15}/>}
        </button>
        <button aria-label="Restart live preview" onClick={() => {
          phase.current = 0
          const context = canvas.current?.getContext('2d')
          if (context) renderLabFrame(context, doc, index, 0, transition)
          setPlaying(true)
        }}><RotateCcw size={15}/></button>
        <button className="live-mutate" aria-label="Mutate" title="Mutate" onClick={onMutate}><Shuffle size={15}/><span>Mutate</span></button>
      </div>
    </div>
    <canvas ref={canvas} width={WIDTH} height={LAB_HEIGHT} style={{background: themes[doc.theme][0]}} aria-label={transition ? 'Two-beat transition frame' : 'Selected beat frame'}/>
  </section>
}
