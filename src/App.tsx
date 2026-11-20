import {useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode} from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown, Download, FileJson,
  ImageDown, Layers2, Maximize2, Pause, Play, Plus, Redo2, Repeat2, RotateCcw, Shuffle, Trash2, Type, Undo2, Upload, X,
} from 'lucide-react'
import {demos} from './demos'
import {
  boundaries, decode, editText, effects, fonts, linkedAnchors, makeBeat, modes, mutate, newId, repairLinks,
  reveals, roles, themes, transitions, type Beat, type Document, type Emphasis, type Theme, type Typography,
} from './model'
import {draftKey, download, keep, readCollection, readDraft} from './persistence'
import {beatStart, clamp, locate, readingSeconds, totalTime} from './timeline'
import {HEIGHT, WIDTH} from './layout'
import {renderFrame} from './render'

const descriptions = {
  Reading: 'Set the type and let the words sit.',
  Focus: 'Shift attention through the marked passages.',
  Reveal: 'Bring in the text a little at a time.',
  Transform: 'Give the words a physical rhythm.',
}
const themeLabels: Record<Theme, string> = {Paper: 'Warm paper', Night: 'Night ink', Moss: 'Soft moss', Lilac: 'Pale lilac'}

function Choices<T extends string>({label, values, value, set}: {label: string; values: readonly T[]; value: T; set: (value: T) => void}) {
  return <div className="choices" role="group" aria-label={label}>
    {values.map(item => <button key={item} type="button" className={value === item ? 'active' : ''} aria-pressed={value === item} onClick={() => set(item)}>{item}</button>)}
  </div>
}
function IconButton({label, children, action, disabled = false, pressed}: {
  label: string; children: ReactNode; action: () => void; disabled?: boolean; pressed?: boolean
}) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={action} disabled={disabled} aria-pressed={pressed}>{children}</button>
}
function Slider({label, value, min, max, step = 1, unit = '', set}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; set: (value: number) => void
}) {
  return <label className="slider"><span>{label}<output>{value}{unit}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(e.currentTarget.valueAsNumber)} />
  </label>
}
const seconds = (time: number) => time.toFixed(1) + 's'
const pad = (number: number) => String(number).padStart(2, '0')
type History = {past: Document[]; doc: Document; future: Document[]}
type MobileView = 'edit' | 'preview'
const mobileWidth = '(max-width: 760px)'

export function App() {
  const [initial] = useState(() => readDraft(demos[0]))
  const [{past, doc, future}, setHistory] = useState<History>({past: [], doc: initial.doc, future: []})
  const [edited, setEdited] = useState(false)
  const [collection, setCollection] = useState(readCollection)
  const [selected, setSelected] = useState(initial.doc.beats[0].id)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [menu, setMenu] = useState<'files' | 'collection' | null>(null)
  const [notice, setNotice] = useState(initial.damaged ? 'The draft could not be read. Your saved collection is still available.' : '')
  const [frameWarning, setFrameWarning] = useState(false)
  const [selection, setSelection] = useState([0, 0])
  const [showSource, setShowSource] = useState(false)
  const [mobile, setMobile] = useState(() => matchMedia(mobileWidth).matches)
  const [mobileView, setMobileView] = useState<MobileView>('edit')
  const canvas = useRef<HTMLCanvasElement>(null)
  const compactCanvas = useRef<HTMLCanvasElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const previewButton = useRef<HTMLButtonElement>(null)
  const editorScroll = useRef(0)
  const editPosition = useRef<{beatId: string; start: number; end: number; direction: HTMLTextAreaElement['selectionDirection']; scroll: number} | null>(null)
  const pendingView = useRef<MobileView | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const timeRef = useRef(0)
  const playbackOrigin = useRef(0)
  const duration = totalTime(doc)
  const frame = locate(doc, time)
  const beat = doc.beats.find(b => b.id === selected) ?? doc.beats[0]
  const beatIndex = doc.beats.indexOf(beat)
  const next = doc.beats[beatIndex + 1]
  const editingOnPhone = mobile && mobileView === 'edit'
  const compactTime = frame.beat.id === beat.id ? time : beatStart(doc, beatIndex)

  function preserveFieldFocus(event: PointerEvent<HTMLButtonElement>) {
    if (document.activeElement instanceof HTMLTextAreaElement) event.preventDefault()
  }

  function switchView(view: MobileView) {
    if (view === mobileView) return
    if (view === 'preview') {
      editorScroll.current = window.scrollY
      const field = textarea.current
      if (field) editPosition.current = {
        beatId: beat.id, start: field.selectionStart, end: field.selectionEnd,
        direction: field.selectionDirection, scroll: field.scrollTop,
      }
    } else {
      setPlaying(false)
    }
    setMenu(null)
    pendingView.current = view
    setMobileView(view)
  }

  function seek(value: number) {
    timeRef.current = value
    setTime(value)
  }
  function selectBeat(index: number) {
    const target = doc.beats[index]
    if (!target) return
    setPlaying(false)
    setSelected(target.id)
    setSelection([0, 0])
    seek(beatStart(doc, index))
  }
  function commit(value: Document) {
    setEdited(true)
    setHistory(history => ({past: [...history.past.slice(-79), history.doc], doc: repairLinks(value), future: []}))
  }
  function changeBeat(patch: Partial<Beat>) {
    commit({...doc, beats: doc.beats.map(b => b.id === beat.id ? {...b, ...patch} : b)})
  }
  function type(patch: Partial<Typography>) {
    changeBeat({typography: {...beat.typography, ...patch}})
  }
  function travel(forward: boolean) {
    const destination = forward ? future[0] : past.at(-1)
    if (!destination) return
    setEdited(true)
    setPlaying(false)
    setSelection([0, 0])
    setHistory(forward
      ? {past: [...past, doc], doc: destination, future: future.slice(1)}
      : {past: past.slice(0, -1), doc: destination, future: [doc, ...future]})
    const index = Math.max(0, destination.beats.findIndex(b => b.id === selected))
    setSelected(destination.beats[index].id)
    seek(beatStart(destination, index))
  }
  function load(value: Document) {
    commit(value)
    setPlaying(false)
    setSelected(value.beats[0].id)
    setSelection([0, 0])
    seek(0)
    setMenu(null)
  }

  useEffect(() => {
    if (!edited) return
    try {
      if (initial.damaged) {
        const raw = localStorage.getItem(draftKey)
        if (raw && localStorage.getItem(draftKey + ':recovery') === null) {
          localStorage.setItem(draftKey + ':recovery', raw)
        }
      }
      localStorage.setItem(draftKey, JSON.stringify(doc))
    } catch { setNotice('Draft storage is unavailable. Export JSON to save your work.') }
  }, [doc, edited, initial.damaged])
  useEffect(() => {
    if (!playing) return
    let id: number
    playbackOrigin.current = performance.now() - timeRef.current * 1000
    function tick(now: number) {
      const elapsed = Math.max(0, (now - playbackOrigin.current) / 1000)
      const current = loop ? elapsed % duration : Math.min(duration, elapsed)
      seek(current)
      if (!loop && elapsed >= duration) setPlaying(false)
      else id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [duration, loop, playing])
  useEffect(() => {
    const media = matchMedia(mobileWidth)
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    update()
    return () => media.removeEventListener('change', update)
  }, [])
  useLayoutEffect(() => {
    if (pendingView.current !== mobileView) return
    pendingView.current = null
    if (mobileView === 'preview') {
      previewButton.current?.focus({preventScroll: true})
      window.scrollTo(0, 0)
      return
    }
    editButton.current?.focus({preventScroll: true})
    const position = editPosition.current
    const field = textarea.current
    if (field && position?.beatId === beat.id) {
      field.setSelectionRange(position.start, position.end, position.direction)
      field.scrollTop = position.scroll
      setSelection([field.selectionStart, field.selectionEnd])
    }
    window.scrollTo(0, editorScroll.current)
  }, [beat.id, mobileView])
  useLayoutEffect(() => {
    if (editingOnPhone) return
    const ctx = canvas.current?.getContext('2d')
    if (ctx) setFrameWarning(renderFrame(ctx, doc, time).clipped)
  }, [doc, time, editingOnPhone])
  useLayoutEffect(() => {
    if (!editingOnPhone) return
    const ctx = compactCanvas.current?.getContext('2d')
    if (ctx) renderFrame(ctx, doc, compactTime)
  }, [doc, compactTime, editingOnPhone])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !['z', 'y'].includes(event.key.toLowerCase())) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return
      event.preventDefault()
      travel(event.shiftKey || event.key.toLowerCase() === 'y')
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  })

  function play() {
    if (!playing && time >= duration) seek(0)
    setPlaying(!playing)
  }
  function addBeat() {
    if (doc.beats.length >= 5) return
    const added = makeBeat('')
    commit({...doc, beats: [...doc.beats, added]})
    setPlaying(false)
    seek(duration)
    setSelected(added.id)
    setSelection([0, 0])
    textarea.current?.focus()
  }
  function moveBeat(offset: number) {
    const target = beatIndex + offset
    if (target < 0 || target >= doc.beats.length) return
    const beats = [...doc.beats]
    ;[beats[beatIndex], beats[target]] = [beats[target], beats[beatIndex]]
    const value = {...doc, beats}
    commit(value)
    setPlaying(false)
    seek(beatStart(value, target))
  }
  function removeBeat() {
    if (doc.beats.length < 2) return
    const value = {...doc, beats: doc.beats.filter(b => b.id !== beat.id)}
    const index = Math.min(beatIndex, value.beats.length - 1)
    commit(value)
    setSelected(value.beats[index].id)
    setPlaying(false)
    setSelection([0, 0])
    seek(beatStart(value, index))
  }
  function splitBeat() {
    const index = selection[0]
    if (index <= 0 || index >= beat.text.length || doc.beats.length >= 5 || !boundaries(beat.text).has(index)) return
    const left = {...beat, text: beat.text.slice(0, index), emphasis: beat.emphasis.filter(m => m.end <= index), transition: {type: 'Replace'} as const}
    const right = {...beat, id: newId(), text: beat.text.slice(index), emphasis: beat.emphasis.filter(m => m.start >= index).map(m => ({...m, start: m.start - index, end: m.end - index}))}
    commit({...doc, beats: [...doc.beats.slice(0, beatIndex), left, right, ...doc.beats.slice(beatIndex + 1)]})
    setSelection([0, 0])
  }
  function mark(role: Emphasis['role']) {
    const [start, end] = selection
    const edges = boundaries(beat.text)
    if (end <= start || !edges.has(start) || !edges.has(end)) {
      setNotice('Select a complete word or passage to add an emphasis.')
      return
    }
    const retained = beat.emphasis.filter(m => m.end <= start || m.start >= end)
    if (retained.length >= 100) { setNotice('A beat can have up to 100 emphasis ranges.'); return }
    changeBeat({emphasis: [...retained, {id: newId(), start, end, role}].sort((a, b) => a.start - b.start)})
    setNotice('')
  }
  function setLink(pair: string) {
    const [from, to] = pair ? JSON.parse(pair) as [string, string] : []
    changeBeat({transition: {type: 'Persist', from, to}})
  }
  const pairs = beat.emphasis.filter(m => m.role === 'Anchor').flatMap(a =>
    (next?.emphasis ?? []).filter(b => b.role === 'Anchor' && beat.text.slice(a.start, a.end) === next?.text.slice(b.start, b.end))
      .map(b => ({a, b, text: beat.text.slice(a.start, a.end)})))
  async function importFile(source?: File) {
    if (!source) return
    try {
      if (source.size > 1000000) throw new Error('Choose a JSON file under 1 MB.')
      load(decode(JSON.parse(await source.text())))
      setNotice('Composition imported.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The file could not be imported.')
    }
  }
  function exportFrame() {
    const surface = editingOnPhone ? compactCanvas.current : canvas.current
    if (!surface) return
    surface.toBlob(blob => {
      if (blob) download(blob, 'text-lab-frame.png')
      else setNotice('The PNG could not be exported.')
    }, 'image/png')
    setMenu(null)
  }
  function save() {
    try {
      const saved = keep(doc)
      setCollection(list => [saved, ...list])
      setNotice('Saved to the collection.')
    } catch { setNotice('Collection storage is unavailable. Export JSON to keep a copy.') }
  }

  const demoBar = <div className="demo-bar"><span>Demos</span><div className="demo-list">{demos.map(demo => <button key={demo.title} className={doc.title === demo.title ? 'current' : ''} onClick={() => load(demo)}>{demo.title}</button>)}</div></div>

  return <>
    <header className="app-header">
      <div className="brand"><span className="brand-mark"><Type size={21} strokeWidth={2.15} /></span><span>Text Lab<small>Visual reading playground</small></span></div>
      <div className="top-actions">
        <div className="history-actions">
          <IconButton label="Undo" action={() => travel(false)} disabled={!past.length}><Undo2 size={17}/></IconButton>
          <IconButton label="Redo" action={() => travel(true)} disabled={!future.length}><Redo2 size={17}/></IconButton>
        </div>
        <div className="menu-anchor">
          <button className="toolbar-button collection-button" onClick={() => setMenu(menu === 'collection' ? null : 'collection')} aria-expanded={menu === 'collection'}><Layers2 size={16}/><span>Collection</span></button>
          {menu === 'collection' && <div className="popover collection-popover">
            <strong>Collection</strong>
            {!collection.length && <p>Use Keep to save a composition here.</p>}
            {collection.map(entry => <button key={entry.key} onClick={() => load(entry.doc)}><Bookmark size={15}/>{entry.doc.title}</button>)}
          </div>}
        </div>
        <button className="toolbar-button keep-button" onClick={save}><Bookmark size={16}/><span>Keep</span></button>
        <div className="menu-anchor">
          <button className="toolbar-button export-button" onClick={() => setMenu(menu === 'files' ? null : 'files')} aria-expanded={menu === 'files'}><Download size={16}/><span>Export</span><ChevronDown size={13}/></button>
          {menu === 'files' && <div className="popover">
            <button onClick={exportFrame}><ImageDown size={16}/> Export current PNG</button>
            <button onClick={() => { download(new Blob([JSON.stringify(doc, null, 2)], {type: 'application/json'}), 'text-lab.json'); setMenu(null) }}><FileJson size={16}/> Export JSON</button>
            <button onClick={() => {file.current?.click(); setMenu(null)}}><Upload size={16}/> Import JSON</button>
          </div>}
        </div>
        <input hidden ref={file} type="file" accept=".json,application/json" aria-label="Import document" onChange={event => {void importFile(event.target.files?.[0]); event.target.value = ''}}/>
      </div>
    </header>

    <nav className="mobile-views" aria-label="Workspace view">
      <button ref={editButton} aria-pressed={mobileView === 'edit'} aria-controls="composition-editor" onClick={() => switchView('edit')}>Edit</button>
      <button ref={previewButton} aria-pressed={mobileView === 'preview'} aria-controls="full-preview" onPointerDown={preserveFieldFocus} onClick={() => switchView('preview')}>Preview</button>
    </nav>
    <main className="workspace" data-mobile-view={mobileView}>
      <section id="full-preview" className="preview" aria-label="Preview">
        <div className="pane-heading">
          <h2><span className="live-dot"/>Preview</h2>
          <button className="back-to-edit" onClick={() => switchView('edit')}><ArrowLeft size={16}/> Back to Edit</button>
          <span className="format">9:16 <span>·</span> 1080 × 1920</span>
        </div>
        <div className="stage">
          <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label={frame.beat.text || 'Empty composition frame'} />
          {frameWarning && <div className="overflow-warning">Text exceeds the frame. Split this beat for a readable layout.</div>}
        </div>
        <div className="transport">
          <div className="transport-controls">
            <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={play}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button>
            <IconButton label="Restart" action={() => {playbackOrigin.current = performance.now(); seek(0)}}><RotateCcw size={16}/></IconButton>
            <IconButton label="Previous beat" action={() => selectBeat(frame.index - 1)} disabled={frame.index === 0}><ArrowLeft size={16}/></IconButton>
            <IconButton label="Next beat" action={() => selectBeat(frame.index + 1)} disabled={frame.index === doc.beats.length - 1}><ArrowRight size={16}/></IconButton>
            <IconButton label="Loop" action={() => setLoop(!loop)} pressed={loop}><Repeat2 size={17}/></IconButton>
            <span className="timecode">{seconds(Math.min(time, duration))} <span>/ {seconds(duration)}</span></span>
          </div>
          <input className="scrubber" aria-label="Scrub time" type="range" min={0} max={duration} step={0.01} value={Math.min(time, duration)} onChange={event => {
            const value = event.currentTarget.valueAsNumber
            setPlaying(false)
            const id = locate(doc, value).beat.id
            if (id !== beat.id) {
              editPosition.current = null
              setSelected(id)
              setSelection([0, 0])
            }
            seek(clamp(value, 0, duration))
          }}/>
        </div>
        {!mobile && demoBar}
      </section>

      <section id="composition-editor" className="editor" aria-label="Editor">
        <div className="composition-head">
          <div className="editor-head">
            <label htmlFor="composition-title">Composition</label>
            <button className="mutate-button" onClick={() => changeBeat(mutate(beat))}><Shuffle size={16}/> Mutate</button>
          </div>
          <input id="composition-title" className="composition-title" value={doc.title} maxLength={100} onChange={e => commit({...doc, title: e.currentTarget.value || 'Untitled'})}/>
          {mobile && <button className="compact-preview" aria-label="Open full Preview" onPointerDown={preserveFieldFocus} onClick={() => switchView('preview')}>
            <span><span className="compact-label"><span className="live-dot"/><span className="compact-beat">Beat {pad(beatIndex + 1)} ·</span> {seconds(compactTime)}</span>
              <span className="open-preview-label">Open full Preview <Maximize2 size={14}/></span>
            </span>
            <canvas ref={compactCanvas} width={WIDTH} height={HEIGHT} aria-hidden="true"/>
          </button>}
        </div>
        <div className="editor-section beats-section">
          <div className="section-heading"><h2>Beats <span className="count">{doc.beats.length} / 5</span></h2><button className="small-button" onClick={addBeat} disabled={doc.beats.length >= 5}><Plus size={15}/> Add beat</button></div>
          <div className="beat-list">{doc.beats.map((item, index) => <button key={item.id} className={'beat-card ' + (item.id === beat.id ? 'selected' : '')} onClick={() => selectBeat(index)} aria-pressed={item.id === beat.id}>
            <span className="beat-meta"><span>{pad(index + 1)}</span><span>{seconds(item.duration)}</span></span>
            <strong>{item.text.trim() || 'Empty beat'}</strong><span className="beat-mode">{item.mode}</span>
          </button>)}</div>
        </div>
        <div className="editor-section text-section">
          <div className="section-heading"><h2><label htmlFor="beat-text">Beat {pad(beatIndex + 1)} · Text</label></h2>
            <div className="inline-actions">
              <IconButton label="Move beat earlier" action={() => moveBeat(-1)} disabled={beatIndex === 0}><ArrowUp size={15}/></IconButton>
              <IconButton label="Move beat later" action={() => moveBeat(1)} disabled={!next}><ArrowDown size={15}/></IconButton>
              <IconButton label="Delete beat" action={removeBeat} disabled={doc.beats.length === 1}><Trash2 size={15}/></IconButton>
            </div>
          </div>
          <textarea id="beat-text" ref={textarea} value={beat.text} maxLength={5000} placeholder="Write or paste a passage…" onChange={e => {
            const updated = editText(beat, e.currentTarget.value)
            changeBeat(updated)
            setSelection([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])
          }} onSelect={e => setSelection([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}/>
          <div className="emphasis-tools"><span>Emphasis</span>{roles.map(role => <button className={'emphasis-role ' + role.toLowerCase()} key={role} disabled={selection[0] === selection[1]} title="Select text to assign an emphasis" onClick={() => mark(role)}>{role}</button>)}
            <button className="split-button" onClick={splitBeat} disabled={!selection[0] || selection[0] >= beat.text.length || doc.beats.length >= 5}>Split at cursor</button>
          </div>
          {beat.emphasis.length > 0 && <div className="mark-list">{beat.emphasis.map(item => <button key={item.id} title={'Remove ' + item.role} aria-label={'Remove emphasis ' + beat.text.slice(item.start, item.end)} onClick={() => changeBeat({emphasis: beat.emphasis.filter(m => m.id !== item.id)})}>{beat.text.slice(item.start, item.end)} <X size={12}/></button>)}</div>}
          <button className="source-toggle" aria-expanded={showSource} onClick={() => setShowSource(!showSource)}><ChevronDown size={13}/> Original text</button>
          {showSource && <textarea aria-label="Original text" value={doc.originalText} maxLength={25000} onChange={e => commit({...doc, originalText: e.currentTarget.value})}/>}
        </div>
        {mobile && demoBar}
        <div className="editor-section">
          <div className="section-heading"><h2>Presentation</h2></div>
          <Choices label="Presentation mode" values={modes} value={beat.mode} set={mode => changeBeat({mode})}/>
          <p className="mode-description">{descriptions[beat.mode]}</p>
          {beat.mode === 'Reveal' && <Choices label="Reveal by" values={reveals} value={beat.reveal} set={reveal => changeBeat({reveal})}/>}
          {beat.mode === 'Transform' && <>
            <Choices label="Motion effect" values={effects} value={beat.effect} set={effect => changeBeat({effect})}/>
            <Slider label="Intensity" value={beat.intensity} min={0} max={100} unit="%" set={intensity => changeBeat({intensity})}/>
          </>}
        </div>
        <div className="editor-section">
          <div className="section-heading"><h2>Typography</h2>
            <div className="swatches" role="group" aria-label="Palette">{(Object.keys(themes) as Theme[]).map(theme => <button key={theme} title={themeLabels[theme]} aria-label={themeLabels[theme]} aria-pressed={doc.theme === theme} style={{background: themes[theme][0], color: themes[theme][1]}} onClick={() => commit({...doc, theme})}>{doc.theme === theme && <Check size={12}/>}</button>)}</div>
          </div>
          <Choices label="Typeface" values={fonts} value={beat.typography.font} set={font => type({font})}/>
          <div className="slider-grid">
            <Slider label="Size" value={beat.typography.size} min={36} max={170} unit=" px" set={size => type({size})}/>
            <Slider label="Leading" value={beat.typography.leading} min={1} max={1.8} step={0.01} set={leading => type({leading})}/>
            <Slider label="Weight" value={beat.typography.weight} min={400} max={900} step={100} set={weight => type({weight})}/>
            <Slider label="Block width" value={beat.typography.width} min={45} max={92} unit="%" set={width => type({width})}/>
          </div>
          <div className="type-footer"><Choices label="Alignment" values={['Left', 'Center', 'Right'] as const} value={beat.typography.align} set={align => type({align})}/>
          <label className="toggle"><input type="checkbox" checked={beat.typography.bionic} onChange={e => type({bionic: e.currentTarget.checked})}/> Bionic</label></div>
        </div>
        <div className="editor-section closing-section">
          <div className="section-heading"><h2>Timing</h2><label className="duration-input">Duration <input aria-label="Beat duration" type="number" min="0.5" max="120" step="0.1" key={beat.id + beat.duration} defaultValue={beat.duration} onBlur={e => {
            const value = e.currentTarget.valueAsNumber
            if (!Number.isFinite(value) || clamp(value, 0.5, 120) === beat.duration) {e.currentTarget.value = String(beat.duration); return}
            e.currentTarget.value = String(clamp(value, 0.5, 120))
            changeBeat({duration: clamp(value, 0.5, 120)})
          }} onKeyDown={e => {if (e.key === 'Enter') e.currentTarget.blur()}}/> s</label></div>
          {readingSeconds(beat) * (beat.mode === 'Reveal' ? 1.5 : 1) > beat.duration && <p className="reading-warning">This beat may be too short to read comfortably.</p>}
          {next && <>
            <span className="field-label">Transition to beat {pad(beatIndex + 2)}</span>
            <Choices label="Transition" values={transitions} value={beat.transition.type} set={transition => changeBeat({transition: {type: transition}})}/>
            {beat.transition.type === 'Persist' && (pairs.length
              ? <label className="link-field">Link anchor ranges
                <select aria-label="Link anchor ranges" value={linkedAnchors(beat, next) ? JSON.stringify([beat.transition.from, beat.transition.to]) : ''} onChange={e => setLink(e.currentTarget.value)}>
                  <option value="">Choose a pair</option>
                  {pairs.map(({a, b, text}) => <option key={JSON.stringify([a.id,b.id])} value={JSON.stringify([a.id,b.id])}>{text} ({a.start} → {b.start})</option>)}
                </select>
              </label>
              : <p className="mode-description">Mark the same passage as Anchor in both beats to link it.</p>)}
          </>}
        </div>
      </section>
    </main>
    {notice && <div className="toast" role="status">{notice}<IconButton label="Dismiss message" action={() => setNotice('')}><X size={16}/></IconButton></div>}
  </>
}
