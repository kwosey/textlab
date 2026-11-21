import React from 'react'
import {Composition, registerRoot, useCurrentFrame} from 'remotion'
import source from '../../002/composition.json'
import {adapt, fps, moveAt} from './adapter.mjs'

const storyboard = adapt(source)
const ink = '#fff6df'
const cool = '#83dfed'
const hot = '#ff875f'
const clamp = x => Math.max(0, Math.min(1, x))
const laneX = x => 35 + x * 4.75
const label = {fontFamily: 'monospace', letterSpacing: '0.11em', fontWeight: 700}
const copy = {
  hook: {sizes: [86, 55], colors: [hot, ink], y: 158},
  flow: {sizes: [51, 38], colors: [ink, cool], y: 165},
  brake: {sizes: [42, 37], colors: [ink, hot], y: 165},
  reverse: {sizes: [43, 39], colors: [cool, hot], y: 155},
  payoff: {sizes: [52, 40], colors: [hot, ink], y: 754},
}

function Car({x, braking}) {
  return <g transform={`translate(${x} 510)`}>
    <rect x="-29" y="-17" width="58" height="38" rx="13" fill="#060c18" opacity=".75"/>
    <path d="M-25 -16H8Q28 -16 31 0Q28 16 8 16H-25Q-30 16-30 10V-10Q-30-16-25-16Z"
      stroke={braking ? hot : cool} strokeWidth="2" fill={braking ? '#6f393d' : '#295878'}/>
    <path d="M-10 -10H9L17 -6V6L9 10H-10L-15 6V-6Z" fill="#0d2138"/>
    <path d="M21 -9l5 4m-5 14 5-4" stroke="#e6f9ef" strokeWidth="2" strokeLinecap="round"/>
    {[-9, 9].map(y => <g key={y}>
      {braking && <circle cx="-28" cy={y} r="9" fill={hot} opacity=".32"/>}
      <rect x="-31" y={y-2} width="7" height="4" rx="2" fill={braking ? '#ffae7c' : '#aa5b64'}/>
    </g>)}
  </g>
}

function Film() {
  const frame = useCurrentFrame()
  const [beat, index] = storyboard.beats.map((beat, index) => [beat, index])
    .find(([beat]) => frame >= beat.start && frame < beat.end)
  const t = (frame - beat.start) / fps
  const lines = beat.text.split('\n')
  const style = copy[beat.id]
  const entrance = Math.min(.24, beat.reveal / lines.length)
  const brake = beat.id === 'brake'
  const reverse = beat.id === 'reverse'
  const engaged = move => brake && t >= move.at + Math.max(0, move.duration - .26)
  const carMoves = beat.moves.filter(move => move.kind === 'Rectangle')
  const stopped = carMoves.filter(engaged)
  const wave = beat.moves.find(move => move.kind === 'Line')
  const waveX = wave ? laneX(moveAt(wave, t)) : stopped.length ? laneX(moveAt(stopped[0], t)) - 26 : 0
  const camera = brake ? 1 + .11 * clamp(t / 2.2) : beat.id === 'hook' ? 1.07 - .07 * clamp(t / 2) : 1
  return <svg width="540" height="960" viewBox="0 0 540 960" role="img" aria-label={beat.text}>
    <defs>
      <radialGradient id="paper" cx=".23" cy=".18" r=".95">
        <stop stopColor="#20364c"/><stop offset="1" stopColor="#080f1d"/>
      </radialGradient>
      <clipPath id="lane"><rect x="0" y="320" width="540" height="327"/></clipPath>
    </defs>
    <rect width="540" height="960" fill="url(#paper)"/>
    <g fill={cool} opacity=".7" style={label} fontSize="14">
      <text x="36" y="66">ФИЗИКА ПОТОКА</text>
      <text x="504" y="66" textAnchor="end">{String(index + 1).padStart(2, '0')} / 05</text>
    </g>
    <path d="M36 84H504M36 864H504" stroke="#41617b"/>
    <g clipPath="url(#lane)">
      <g transform={`translate(270 510) scale(${camera}) translate(-270 -510)`}>
        <rect x="-100" y="394" width="740" height="224" fill="#0b1526"/>
        <rect x="-100" y="464" width="740" height="92" fill="#17283d"/>
        <path d="M-100 466H640M-100 554H640" stroke="#5a8299" strokeWidth="2"/>
        <path d="M-100 449H640M-100 572H640" stroke="#345069" strokeDasharray="3 14" strokeWidth="6"/>
        {carMoves.map((move, i) => <Car key={i} x={laneX(moveAt(move, t))} braking={engaged(move) || (beat.id === 'hook' && i === 2)}/>)}
        {reverse && <path d="M45 600H489l-14 -7m14 7 -14 7" stroke={cool} strokeWidth="3" fill="none"/>}
        {(reverse || stopped.length > 0) && <g transform={`translate(${waveX} 416)`} stroke={hot} fill="none">
          <path d="M58 0H-36l15 -11m-15 11 15 11" strokeWidth="5" strokeLinejoin="round"/>
          {brake && <path d="M0 15V45" strokeWidth="2" strokeDasharray="4 5" opacity=".7"/>}
        </g>}
      </g>
    </g>
    <g style={{fontFamily:'Arial, sans-serif', fontWeight:850, letterSpacing:'-.035em'}}>
      {lines.map((line, i) => {
        const from = i * (beat.reveal - entrance) / Math.max(1, lines.length - 1)
        const opacity = entrance ? clamp((t - from) / entrance) : 1
        return <text key={i} x="34" y={style.y + (i ? style.sizes[0] * .83 : 0)}
          fontSize={style.sizes[i]} fill={style.colors[i]} opacity={opacity}>{line}</text>
      })}
    </g>
    <g style={label} fill="#8aa7c0" fontSize="13">
      <text x="36" y="893">СХЕМА ДВИЖЕНИЯ</text>
      <text x="504" y="893" textAnchor="end">ПРОБКА-ПРИЗРАК</text>
    </g>
  </svg>
}

function Root() {
  return <Composition id="GateA" component={Film} fps={fps} width={540} height={960}
    durationInFrames={storyboard.durationInFrames}/>
}

registerRoot(Root)
