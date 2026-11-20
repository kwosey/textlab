import {useState} from 'react'
import {ChevronDown, Plus, Trash2} from 'lucide-react'
import {Choices, Slider} from './Controls'
import {
  backgrounds, backgroundDefaults, graphicDefaults, maxShapes, sceneTones,
  shapeMotions, shapes, typeMotions, typeMotionDefaults, type Graphic, type Scene,
} from './scene'

export function SceneEditor({scene, onChange, onAnimate}: {
  scene?: Scene; onChange: (scene: Scene | undefined) => void; onAnimate: () => void
}) {
  const [selectedShape, selectShape] = useState(0)
  const background = scene?.background
  const treatment = scene?.typeMotion
  const graphics = scene?.shapes ?? []
  const index = Math.min(selectedShape, graphics.length - 1)
  const shape = graphics[index]
  const graphic = shape && {...graphicDefaults, ...shape}
  const active = [background?.kind && background.kind !== 'Off' ? background.kind : '',
    graphics.length ? `${graphics.length} ${graphics.length === 1 ? 'shape' : 'shapes'}` : '',
    treatment?.kind && treatment.kind !== 'Off' ? treatment.kind : ''].filter(Boolean)

  function changeShape(patch: Partial<Graphic>, animate = false) {
    onChange({...scene, shapes: graphics.map((item, i) => i === index ? {...item, ...patch} : item)})
    if (animate) onAnimate()
  }

  return <details className="editor-section scene-editor">
    <summary><strong>Scene</strong><span className="scene-status">{active.join(' · ') || 'Off'}</span><ChevronDown size={16}/></summary>
    <div className="scene-content">
      <section aria-label="Scene background">
        <h2>Background</h2>
        <Choices label="Background" values={backgrounds} value={background?.kind ?? 'Off'} set={kind => {
          onChange({...scene, background: {...background, kind}})
          onAnimate()
        }}/>
        {background && background.kind !== 'Off' && <div className="slider-grid">
          <Slider label="Background intensity" value={background.intensity ?? backgroundDefaults.intensity}
            min={0} max={100} unit="%" set={intensity => onChange({...scene, background: {...background, intensity}})}/>
          <Slider label="Background speed" value={background.speed ?? backgroundDefaults.speed}
            min={0} max={2} step={0.05} unit="×" set={speed => onChange({...scene, background: {...background, speed}})}/>
          <Slider label="Background scale" value={background.scale ?? backgroundDefaults.scale}
            min={50} max={150} unit="%" set={scale => onChange({...scene, background: {...background, scale}})}/>
        </div>}
      </section>
      <section aria-label="Scene shapes">
        <div className="section-heading"><h2>Shapes</h2>
          <button className="small-button" disabled={graphics.length >= maxShapes} onClick={() => {
            onChange({...scene, shapes: [...graphics, {kind: 'Circle', x: 50 + graphics.length * 8, y: 48 + graphics.length * 8}]})
            selectShape(graphics.length)
            onAnimate()
          }}><Plus size={14}/> Add shape</button>
        </div>
        {!!graphics.length && <div className="scene-shape-strip" role="group" aria-label="Select shape">
          {graphics.map((item, i) => <button className="small-button" key={i} aria-pressed={i === index}
            onClick={() => selectShape(i)}>{i + 1} · {item.kind}</button>)}
        </div>}
        {graphic && <>
          <Choices label="Shape type" values={shapes} value={graphic.kind} set={kind => changeShape({kind}, true)}/>
          <Choices label="Shape motion" values={shapeMotions} value={graphic.motion} set={motion => changeShape({motion}, true)}/>
          <Choices label="Shape tone" values={sceneTones} value={graphic.tone} set={tone => changeShape({tone})}/>
          <div className="slider-grid">
            <Slider label="Shape horizontal" value={graphic.x} min={0} max={100} unit="%" set={x => changeShape({x})}/>
            <Slider label="Shape vertical" value={graphic.y} min={0} max={100} unit="%" set={y => changeShape({y})}/>
            <Slider label="Shape size" value={graphic.size} min={8} max={90} unit="%" set={size => changeShape({size})}/>
            {graphic.motion !== 'Hold' && <Slider label="Shape motion amount" value={graphic.energy} min={0} max={100}
              unit="%" set={energy => changeShape({energy})}/>}
          </div>
          <button className="small-button scene-remove" onClick={() => {
            onChange({...scene, shapes: graphics.filter((_, i) => i !== index)})
            selectShape(Math.max(0, index - 1))
          }}><Trash2 size={14}/> Remove shape</button>
        </>}
      </section>
      <section aria-label="Scene type motion">
        <h2>Type motion</h2>
        <Choices label="Type motion" values={typeMotions} value={treatment?.kind ?? 'Off'} set={kind => {
          onChange({...scene, typeMotion: {...treatment, kind}})
          onAnimate()
        }}/>
        {treatment && treatment.kind !== 'Off' && <Slider label="Type amount" value={treatment.amount ?? typeMotionDefaults.amount}
          min={0} max={100} unit="%" set={amount => onChange({...scene, typeMotion: {...treatment, amount}})}/>}
      </section>
      <button className="small-button" disabled={!scene} onClick={() => onChange(undefined)}>Reset scene</button>
    </div>
  </details>
}
