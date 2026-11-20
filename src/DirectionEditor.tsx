import {useState} from 'react'
import {Choices, Slider} from './Controls'
import {impacts, maxCues, validCues, type Cue, type Framing, type Impact} from './direction'
import type {Beat} from './model'

type Action = Cue['action']
function makeCue(target: Cue['target'], action: Action, at: number, duration: number): Cue {
  const timing = {at, duration}
  if (action === 'Move' && typeof target === 'number') return {...timing, target, action, x: 50, y: 48}
  if (action === 'Scale') return {...timing, target, action, value: 150} as Cue
  return {...timing, target, action: action === 'Hide' ? 'Hide' : 'Show'}
}

function NumberEdit({label, value, min, max, update}: {
  label: string; value: number; min: number; max: number; update: (value: number) => boolean
}) {
  return <label className="direction-number">{label}<input type="number" min={min} max={max} step="any"
    key={value} defaultValue={value} onBlur={event => {
      const input = event.currentTarget
      const next = input.valueAsNumber
      if (!Number.isFinite(next) || next < min || next > max || (next !== value && !update(next))) input.value = String(value)
    }} onKeyDown={event => {if (event.key === 'Enter') event.currentTarget.blur()}}/></label>
}

export function DirectionEditor({beat, update, preview}: {
  beat: Beat; update: (patch: Partial<Beat>) => void; preview: (time: number) => void
}) {
  const [error, setError] = useState('')
  const cues = beat.cues ?? []
  const shapeCount = beat.scene?.shapes?.length ?? 0
  const framing = beat.framing
  function save(values: Cue[]) {
    values.sort((a, b) => a.at - b.at)
    if (!validCues(values, beat.duration, shapeCount)) {
      setError('Cues must fit this Beat. Events for the same target and property cannot overlap or start together.')
      return false
    }
    setError('')
    update({cues: values})
    return true
  }
  function replace(index: number, cue: Cue) {
    return save(cues.map((item, i) => i === index ? cue : item))
  }
  function frame(patch: Framing) {
    update({framing: {...framing, ...patch}})
  }

  return <details className="editor-section direction-editor">
    <summary><strong>Direction</strong><span className="scene-status">{cues.length ? `${cues.length} cues` : 'Framing and cues'}</span></summary>
    <div className="scene-content">
      <section aria-label="Full-frame typography">
        <h2>Full-frame typography</h2>
        {!framing ? <button className="small-button" onClick={() => frame({x: 50, y: 50, zoom: 100, crop: false})}>Set framing</button> : <>
          <div className="slider-grid">
            <Slider label="Frame X" value={framing.x ?? 50} min={0} max={100} unit="%" set={x => frame({x})}/>
            <Slider label="Frame Y" value={framing.y ?? 50} min={0} max={100} unit="%" set={y => frame({y})}/>
            <Slider label="Frame zoom" value={framing.zoom ?? 100} min={50} max={340} unit="%" set={zoom => frame({zoom})}/>
          </div>
          <label className="toggle"><input type="checkbox" checked={framing.crop ?? false} onChange={e => frame({crop: e.currentTarget.checked})}/> Allow crop at canvas edge</label>
          <p className="mode-description">{framing.crop ? 'Intentional crop. Use 9:16 to check the edges.' : 'Text fits inside the readable area.'}</p>
          <button className="small-button" onClick={() => update({framing: undefined})}>Reset framing</button>
        </>}
      </section>
      <section aria-label="Beat cues">
        <div className="section-heading"><h2>Cues</h2><button className="small-button" disabled={cues.length >= maxCues} onClick={() => {
          const candidate = (['Hide', 'Scale'] as const).map(action => {
            const lane = cues.filter(cue => cue.target === 'Text' && (action === 'Scale' ? cue.action === 'Scale'
              : cue.action === 'Show' || cue.action === 'Hide'))
            const at = lane.reduce((end, cue) => Math.max(end, cue.at + Math.max(cue.duration, 0.1)), 0)
            return makeCue('Text', action, Math.round(at * 1000) / 1000, 0)
          }).find(cue => cue.at < beat.duration)
          if (candidate) save([...cues, candidate])
          else setError('Make room in a text cue lane before adding another cue.')
        }}>Add cue</button></div>
        <p className="mode-description">Seconds from the start of this Beat. Preview pauses on the cue.</p>
        {error && <p className="reading-warning" role="status">{error}</p>}
        {cues.map((cue, index) => <details className="cue" key={index}>
          <summary>{cue.at}s · {cue.target === 'Text' ? 'Text' : 'Shape ' + (cue.target + 1)} · {cue.action}</summary>
          <div className="cue-fields">
            <label className="direction-number">Target<select aria-label="Target" value={cue.target} onChange={event => {
              const target = event.currentTarget.value === 'Text' ? 'Text' : Number(event.currentTarget.value)
              replace(index, makeCue(target, cue.action, cue.at, cue.duration))
            }}><option>Text</option>{Array.from({length: shapeCount}, (_, i) => <option value={i} key={i}>Shape {i + 1}</option>)}</select></label>
            <label className="direction-number">Action<select aria-label="Action" value={cue.action} onChange={event => {
              replace(index, makeCue(cue.target, event.currentTarget.value as Action, cue.at, cue.duration))
            }}>{(typeof cue.target === 'number' ? ['Show', 'Hide', 'Scale', 'Move'] : ['Show', 'Hide', 'Scale']).map(action => <option key={action}>{action}</option>)}</select></label>
            <NumberEdit label="Start (s)" value={cue.at} min={0} max={beat.duration} update={at => replace(index, {...cue, at})}/>
            <NumberEdit label="Length (s)" value={cue.duration} min={0} max={beat.duration} update={duration => replace(index, {...cue, duration})}/>
            {cue.action === 'Scale' && <NumberEdit label="Scale (%)" min={10} max={300} value={cue.value} update={value => replace(index, {...cue, value})}/>}
            {cue.action === 'Move' && <>
              <NumberEdit label="X (%)" min={-100} max={200} value={cue.x} update={x => replace(index, {...cue, x})}/>
              <NumberEdit label="Y (%)" min={-100} max={200} value={cue.y} update={y => replace(index, {...cue, y})}/>
            </>}
          </div>
          <div className="cue-actions">
            <button className="small-button" onClick={() => preview(cue.at)}>Preview cue</button>
            <button className="small-button" onClick={() => save(cues.filter((_, i) => i !== index))}>Remove cue</button>
          </div>
        </details>)}
      </section>
    </div>
  </details>
}

export function ImpactEditor({impact, update}: {impact?: Impact; update: (impact?: Impact) => void}) {
  return <div className="impact-editor">
    <Choices label="Visual handoff" values={impacts} value={impact?.kind ?? 'Default'} set={kind => {
      update(kind === 'Default' ? undefined : kind === 'Cut' ? {kind} : {kind, duration: 0.22, intensity: 65})
    }}/>
    {impact && impact.kind !== 'Cut' && <div className="slider-grid">
      <Slider label="Impact duration" min={0.04} max={0.6} step={0.01} unit="s" value={impact.duration} set={duration => update({...impact, duration})}/>
      <Slider label="Impact intensity" min={0} max={100} unit="%" value={impact.intensity} set={intensity => update({...impact, intensity})}/>
    </div>}
  </div>
}
