import visualScenes from '../examples/visual-scenes-meta-demo.json'
import quiet from '../examples/a-quiet-interval.json'
import {decode, makeBeat, type Beat, type Document} from './model'
const beat = (id: string, text: string, edit: Partial<Beat> = {}) => makeBeat(text, {id, ...edit})
const opening = beat('weather-1', 'Сначала город\nзвучит целиком.', {mode: 'Reveal', reveal: 'Lines', duration: 4.5})
const middle = beat('weather-2', 'Потом дождь отделяет близкое от далёкого.', {mode: 'Reveal', duration: 6.5})
const ending = beat('weather-3', 'Слышно окно.\nСлышно комнату.\nСлышно себя.', {mode: 'Reveal', reveal: 'Phrases', duration: 8})
const tide = beat('tide-1', 'The tide\ncomes in.', {
  mode: 'Transform', effect: 'Wave', duration: 6, intensity: 74,
  emphasis: [{id: 'tide-in', start: 4, end: 8, role: 'Anchor'}],
  transition: {type: 'Persist', from: 'tide-in', to: 'tide-out'},
})
const returnTide = beat('tide-2', 'Even the tide\nlearns to leave.', {
  mode: 'Transform', effect: 'Echo', duration: 6, intensity: 66,
  emphasis: [{id: 'tide-out', start: 9, end: 13, role: 'Anchor'}],
})
export const demos: Document[] = [
  decode(quiet),
  {documentVersion: 1, title: 'После дождя', originalText: [opening, middle, ending].map(b => b.text).join('\n\n'), theme: 'Moss', seed: 27, beats: [opening, middle, ending]},
  {documentVersion: 1, title: 'The Returning Tide', originalText: tide.text + '\n\n' + returnTide.text, theme: 'Night', seed: 777, beats: [tide, returnTide]},
  decode(visualScenes),
]
