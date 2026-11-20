import {useState} from 'react'
import {ArrowRight, Link2} from 'lucide-react'
import {linkedAnchors, matchingAnchors, type Beat, type TextRange} from './model'
import {WordPicker} from './WordPicker'

const label = (index: number) => 'Beat ' + String(index + 1).padStart(2, '0')
const passage = (beat: Beat, range: TextRange) => beat.text.slice(range.start, range.end)
function context(beat: Beat, range: TextRange) {
  const before = Array.from(beat.text.slice(0, range.start))
  const after = Array.from(beat.text.slice(range.end))
  return <span>{before.length > 24 ? '…' : ''}{before.slice(-24).join('')}<strong>{passage(beat, range)}</strong>{after.slice(0, 24).join('')}{after.length > 24 ? '…' : ''}</span>
}

export function AnchorLinks({beat, next, index, onLink, onManual, onClear}: {
  beat: Beat; next: Beat; index: number; onLink: (from: string, to: string) => void
  onManual: (from: TextRange, to: TextRange) => boolean; onClear: () => void
}) {
  const [shown, setShown] = useState(8)
  const [choosing, setChoosing] = useState(false)
  const [manual, setManual] = useState(false)
  const [from, setFrom] = useState<TextRange | null>(null)
  const [to, setTo] = useState<TextRange | null>(null)
  const linked = linkedAnchors(beat, next)
  const pairs = matchingAnchors(beat, next)
  const same = !!from && !!to && passage(beat, from) === passage(next, to)
  const showChoices = !linked || choosing
  const pick = () => {setManual(!manual); setFrom(null); setTo(null)}

  return <div className="anchor-links" aria-label="Persist anchor link">
    {beat.transition.broken && <p className="anchor-warning" role="status">Link broken. The previous passage changed or its Anchor was removed. Choose a new pair.</p>}
    {linked && <div className="anchor-card">
      <div className="anchor-status"><Link2 size={15}/> Linked</div>
      <div className="anchor-passage">
        <span><small>{label(index)}</small><strong>{passage(beat, linked[0])}</strong></span>
        <ArrowRight size={16} aria-hidden="true"/>
        <span><small>{label(index + 1)}</small><strong>{passage(next, linked[1])}</strong></span>
      </div>
      <div className="anchor-actions">
        <button onClick={() => setChoosing(!choosing)} aria-expanded={choosing}>{choosing ? 'Done choosing' : 'Change link'}</button>
        <button onClick={() => {onClear(); setChoosing(false); setManual(false)}}>Remove link</button>
      </div>
    </div>}
    {showChoices && <>
      {pairs.length ? <div className="anchor-suggestions">
        <p className="mode-description">{pairs.length === 1 ? 'One matching pair of Anchors.' : 'Choose the matching passages you want to carry.'}</p>
        {pairs.slice(0, shown).map(({from, to}) => <button key={JSON.stringify([from.id, to.id])} className="anchor-pair"
          onClick={() => {onLink(from.id, to.id); setChoosing(false); setManual(false)}}>
          <span>{pairs.length === 1 ? 'Link suggested pair' : 'Link matching pair'}</span>
          <span><small>{label(index)}</small>{context(beat, from)}</span>
          <span><small>{label(index + 1)}</small>{context(next, to)}</span>
        </button>)}
        {shown < pairs.length && <button onClick={() => setShown(shown + 8)}>Show more matching pairs</button>}
      </div> : <p className="mode-description">No matching Anchors. Choose the same passage in both Beats to link it.</p>}
      <button className="manual-link" aria-expanded={manual} onClick={pick}>{manual ? 'Close word selection' : 'Choose passages manually'}</button>
      {manual && <div className="manual-pickers">
        <WordPicker text={beat.text} label={'Outgoing · ' + label(index)} selection={from} onSelect={setFrom}/>
        <WordPicker text={next.text} label={'Incoming · ' + label(index + 1)} selection={to} onSelect={setTo}/>
        {from && to && !same && <p className="anchor-warning">The selected passages must match exactly.</p>}
        <button className="manual-confirm" disabled={!same} onClick={() => {
          if (!from || !to || !same || !onManual(from, to)) return
          setChoosing(false)
          setManual(false)
        }}>Link selected passages</button>
      </div>}
    </>}
  </div>
}
