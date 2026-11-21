import React from 'react'
import {Composition, registerRoot, useCurrentFrame} from 'remotion'

const W = 540
const H = 960
const smooth = (t, a, b) => {
  const p = Math.min(1, Math.max(0, (t-a)/(b-a)))
  return p*p*(3-2*p)
}
const mix = (a,b,t) => a+(b-a)*t
const frames = [0, 42, 109]

function Plate({background, children}) {
  return <svg width={W} height={H} viewBox="0 0 540 960">
    <rect width={W} height={H} fill={background}/>
    {children}
  </svg>
}

// These two directions are only registered as three still compositions each.
function TypeStudy({phase}) {
  const shift = [365,121,0][phase]
  const base = '#eadab9'
  return <Plate background={base}>
    <rect x="41" y="120" width="458" height="720" fill="#28231f"/>
    <path d="M41 245H499M41 715H499" stroke="#9d8770"/>
    {[0,1,2].map(i => <React.Fragment key={i}>
      <clipPath id={`band${i}`}><rect x="41" y={355+i*78} width="458" height="78"/></clipPath>
      <g clipPath={`url(#band${i})`}>
        {i===1 && <rect x="41" y="433" width="458" height="78" fill="#dd5e3d"/>}
        <text x={270+(i===1?-shift:shift)*(i===2?.45:1)} y="540" textAnchor="middle"
          fontFamily="Arial, sans-serif" fontWeight="900" fontSize="126" letterSpacing="-7"
          fill={i===1?'#292019':base}>СДВИГ</text>
      </g>
    </React.Fragment>)}
    <path d={`M${80+phase*105} 644h90l-17 -12m17 12 -17 12`} fill="none" stroke="#dd5e3d" strokeWidth="5"/>
  </Plate>
}

function Aperture({t}) {
  const scale = mix(1.06,1,smooth(t,0,37))
  const glow = smooth(t,38,97)
  return <Plate background="#101c26">
    <defs>
      <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
        <path d="M26 0H0V26" fill="none" stroke="#345064" strokeWidth="1" opacity=".55"/>
      </pattern>
      <radialGradient id="glow">
        <stop stopColor="#ffb45e" stopOpacity=".36"/><stop offset="1" stopColor="#ffb45e" stopOpacity="0"/>
      </radialGradient>
    </defs>
    <rect x="45" y="161" width="450" height="638" fill="url(#grid)" stroke="#41646c"/>
    <g transform={`translate(270 480) scale(${scale})`}>
      <circle r="212" fill="url(#glow)" opacity={glow}/>
      <circle r="188" fill="none" stroke="#eab266" strokeWidth="2" strokeDasharray="3 11" opacity={glow*.62}/>
      {Array.from({length:24},(_,i)=>{
        const col=i%4, row=Math.floor(i/4)
        const a=(-90+i*15)*Math.PI/180
        const p=smooth(t,3+row*5+col*3,58+row*5+col*3)
        const x=mix((col-1.5)*74,Math.cos(a)*151,p)
        const y=mix((row-2.5)*63,Math.sin(a)*151,p)
        const turn=mix(0,i*15,p)
        return <g key={i} transform={`translate(${x} ${y}) rotate(${turn})`}>
          <rect x="-24" y="-13" width="48" height="26" rx="6" fill={`rgb(${Math.round(mix(51,242,p))} ${Math.round(mix(142,173,p))} ${Math.round(mix(150,89,p))})`}/>
          <path d="M-15 0H15" stroke="#14232c" strokeWidth="3"/>
        </g>
      })}
      <circle r={mix(9,37,glow)} fill="#13212a" stroke="#ffd39d" strokeWidth="3" opacity={glow}/>
      <path d="M-17 0H17M0-17V17" stroke="#ffd39d" strokeWidth="2" opacity={glow}/>
    </g>
    {[ [45,161],[495,161],[45,799],[495,799] ].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="4" fill="#f1b46a"/>)}
  </Plate>
}

function DepthStudy({phase}) {
  const focal=[396,312,261][phase], eye=[378,430,478][phase]
  return <Plate background="#181421">
    <defs><radialGradient id="mist"><stop stopColor="#ffb77a"/><stop offset="1" stopColor="#543758" stopOpacity="0"/></radialGradient></defs>
    <circle cx={focal} cy={eye} r={phase===2?253:147} fill="url(#mist)"/>
    <path d={`M${focal} ${eye}L540 956H0Z`} fill="#694757"/>
    {[0,1,2,3].map(i=>{
      const s=[.31,.52,.79,1.13][i], x=focal+(i+1)*(phase-1)*24
      return <g key={i} transform={`translate(${x} ${eye+120*s}) scale(${s})`}>
        <path d="M-275 194V-188L-151 -326H151L275 -188V194" fill="none"
          stroke={['#ad7688','#694c69','#435572','#273347'][i]} strokeWidth={i===3?62:40}/>
        <path d="M-242 -175L-137 -291H137" fill="none" stroke="#ffa970" strokeWidth="5" opacity={.9-i*.16}/>
      </g>
    })}
    <path d={`M0 0H${phase===0?385:phase===1?180:32}L${phase===0?190:phase===1?67:0} 960H0Z`} fill="#101321"/>
    <circle cx={focal} cy={eye-30} r="17" fill="#ffe0a0"/>
  </Plate>
}

function Motion() { return <Aperture t={useCurrentFrame()}/> }
function Root() {
  return <>
    {[TypeStudy, Aperture, DepthStudy].flatMap((Study, index)=>frames.map((t, phase)=>
      <Composition key={`${index}-${phase}`} id={`Study-${index+1}-${phase+1}`}
        component={()=><Study phase={phase} t={t}/>} width={W} height={H} fps={30} durationInFrames={1}/>
    ))}
    <Composition id="MotionProof" component={Motion} width={W} height={H} fps={30} durationInFrames={120}/>
  </>
}
registerRoot(Root)
