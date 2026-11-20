import {useMemo, useState, type KeyboardEvent} from 'react'
import type {TextRange} from './model'

const tokenizer = new Intl.Segmenter(undefined, {granularity: 'word'})

export function WordPicker({text, label, selection, onSelect}: {
  text: string; label: string; selection: TextRange | null; onSelect: (range: TextRange | null) => void
}) {
  const [phrase, setPhrase] = useState(false)
  const [first, setFirst] = useState<TextRange | null>(null)
  const [focus, setFocus] = useState(0)
  const pieces = useMemo(() => {
    let token = 0
    return [...tokenizer.segment(text)].map(({segment, index}) => ({
      segment, start: index, end: index + segment.length, token: /^\s+$/u.test(segment) ? null : token++,
    }))
  }, [text])

  function choose(range: TextRange) {
    if (phrase && first) {
      onSelect({start: Math.min(range.start, first.start), end: Math.max(range.end, first.end)})
      setFirst(null)
    } else if (selection?.start === range.start && selection.end === range.end) {
      onSelect(null)
      setFirst(null)
    } else {
      onSelect(range)
      setFirst(phrase ? range : null)
    }
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    const index = buttons.findIndex(button => button === event.target)
    if (index < 0) return
    const key = event.key
    const target = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 :
      key === 'ArrowLeft' || key === 'ArrowUp' ? Math.max(0, index - 1) :
      key === 'ArrowRight' || key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1) : -1
    if (target < 0) return
    event.preventDefault()
    buttons[target]?.focus()
  }

  return <div className="word-picker">
    <div className="word-picker-head">
      <strong>{label}</strong>
      <button type="button" className="word-mode" aria-pressed={phrase} onClick={() => {
        setPhrase(!phrase)
        setFirst(null)
      }}>Phrase</button>
    </div>
    <p className="mode-description">{phrase ? (first ? 'Tap the other end of the phrase.' : 'Tap the first and last part of a phrase.') : 'Tap a word. Use Phrase to select a range.'}</p>
    <div className="word-tiles" role="group" aria-label={label} onKeyDown={navigate}>
      {pieces.map(({segment, start, end, token}) => token === null
        ? <span key={start}>{segment.replace(/[^\S\r\n]+/g, ' ')}</span>
        : <button key={start} type="button" tabIndex={focus === token ? 0 : -1}
          aria-pressed={!!selection && selection.start <= start && selection.end >= end}
          onFocus={() => setFocus(token)} onClick={() => choose({start, end})}>{segment}</button>)}
      {!text.trim() && <span>Add text before selecting words.</span>}
    </div>
  </div>
}
