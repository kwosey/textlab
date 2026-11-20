import {useState} from 'react'
import {coolColors, editStyle, roles, styleAt, themes, wordAccents, wordColors, wordWeights, type Beat, type Emphasis, type StyledRange, type TextRange, type Theme, type WordStyle} from './model'
import {WordPicker} from './WordPicker'

export function WordStyling({beat, theme, onStyle, onRole}: {
  beat: Beat; theme: Theme; onStyle: (ranges: StyledRange[]) => void
  onRole: (role: Emphasis['role'], selection: TextRange) => void
}) {
  const [selection, setSelection] = useState<TextRange | null>(null)
  const style = selection ? styleAt(beat, selection) : {}
  const [, ink] = themes[theme]
  const colors = {Ink: ink, Accent: wordAccents[theme], Cool: coolColors[theme]}
  const selectedRole = beat.emphasis.find(mark => selection && mark.start <= selection.start && mark.end >= selection.end)?.role

  function apply(patch: WordStyle, reset = false) {
    if (selection) onStyle(editStyle(beat, selection, patch, reset))
  }

  return <div className="word-styling">
    <WordPicker text={beat.text} label="Choose words" selection={selection} onSelect={setSelection}/>
    <div className="word-tools" aria-label="Word styling">
      <div className="word-tool-row" role="group" aria-label="Word color">
        <span>Color</span>
        {wordColors.map(color => <button key={color} disabled={!selection} aria-pressed={style.color === color}
          onClick={() => apply({color: style.color === color ? undefined : color})}>
          <i className="color-dot" style={{background: colors[color]}}/>{color}
        </button>)}
      </div>
      <div className="word-tool-row" role="group" aria-label="Word weight and style">
        <span>Style</span>
        {wordWeights.map(weight => <button key={weight} disabled={!selection} aria-pressed={style.weight === weight}
          onClick={() => apply({weight: style.weight === weight ? undefined : weight})}>{weight}</button>)}
        <button disabled={!selection} aria-pressed={!!style.italic} onClick={() => apply({italic: style.italic ? undefined : true})}><em>Italic</em></button>
        <button disabled={!selection} aria-pressed={!!style.marker} onClick={() => apply({marker: style.marker ? undefined : true})}>Marker</button>
      </div>
      <div className="word-tool-row" role="group" aria-label="Word role">
        <span>Role</span>
        {roles.map(role => <button key={role} disabled={!selection} aria-pressed={selectedRole === role}
          onClick={() => {if (selection) onRole(role, selection)}}>{role}</button>)}
      </div>
      <button className="reset-words" disabled={!selection} onClick={() => apply({}, true)}>Reset styling</button>
    </div>
  </div>
}
