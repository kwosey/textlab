import React from 'react'
import {Composition, registerRoot, useCurrentFrame} from 'remotion'
import {cameraAt, geometry, project} from './projection.mjs'

const {width, height, fps, frames, light, lightRadius} = geometry
const arches = [
  {z: 10.65, color:'#465057', edge:'#78716b'},
  {z: 8.7, color:'#424e59', edge:'#87817c'},
  {z: 6.98, color:'#344452', edge:'#6a858e'},
  {z: 5.15, color:'#283746', edge:'#76919b'},
]
const outline = (x, crown, z) => [[-x,0,z],[-x,3.05,z],[-x*.62,crown,z],
  [x*.62,crown,z],[x,3.05,z],[x,0,z]]
const [wallX,,wallZ] = geometry.wallEdge
const wallFar = wallZ + .92

function Shot() {
  const camera = cameraAt(useCurrentFrame())
  const uv = p => project(p,camera).map(n=>n.toFixed(3)).join(',')
  const line = pts => pts.map(uv).join(' ')
  const path = pts => 'M'+pts.map(uv).join('L')+'Z'
  const plane = (x1,x2,y1,y2,z) => [[x1,y1,z],[x2,y1,z],[x2,y2,z],[x1,y2,z]]
  const lamp = project(light,camera)
  const radius = lightRadius*geometry.focal/(light[2]-camera.z)
  return <svg width={width} height={height} viewBox="0 0 540 960" aria-label="Проезд из-за стены к светильнику">
    <defs>
      <linearGradient id="stone" x2="0" y2="1"><stop stopColor="#101924"/><stop offset="1" stopColor="#223743"/></linearGradient>
      <linearGradient id="floor" x2="0" y2="1"><stop stopColor="#514040"/><stop offset="1" stopColor="#152530"/></linearGradient>
      <radialGradient id="glow"><stop stopColor="#f2aa6a" stopOpacity=".55"/><stop offset="1" stopColor="#f2aa6a" stopOpacity="0"/></radialGradient>
      <linearGradient id="front" x2="1" y2="1"><stop stopColor="#121925"/><stop offset=".63" stopColor="#0b131e"/><stop offset="1" stopColor="#202b36"/></linearGradient>
      <clipPath id="wall"><polygon points={line(plane(-10,wallX,-7,10,wallZ))}/></clipPath>
    </defs>
    <rect width={width} height={height} fill="url(#stone)"/>
    <polygon points={line([[-2.72,0,1.2],[2.72,0,1.2],[2.72,0,13],[-2.72,0,13]])} fill="url(#floor)"/>
    <polygon points={line([[-.41,0,2.7],[1.21,0,2.7],[1.02,0,12.7],[.55,0,12.7]])} fill="#b17256" opacity=".21"/>
    {[-2.32,-1.53,1.53,2.32].map(x =>
      <polyline key={x} points={line([[x,0,1.22],[x,0,13]])} stroke="#91a4aa" opacity=".45" fill="none"/>)}
    {[3.18,4.32,5.74,7.19,8.82,10.25,11.73].map(z =>
      <polyline key={z} points={line([[-2.7,0,z],[2.7,0,z]])} stroke="#869597" opacity=".23" fill="none"/>)}
    <polygon points={line(plane(-2.69,2.69,.02,4.92,13.05))} fill="#363039"/>
    <polygon points={line(plane(.2,1.49,.02,3.72,12.95))} fill="#544043" stroke="#8b6152"/>
    <circle cx={lamp[0]} cy={lamp[1]} r={radius*5} fill="url(#glow)"/>
    <circle cx={lamp[0]} cy={lamp[1]} r={radius*1.45} fill="#654a46" stroke="#dd9468" strokeWidth="1.5"/>
    <circle cx={lamp[0]} cy={lamp[1]} r={radius} fill="#ffdca0"/>
    <circle cx={lamp[0]} cy={lamp[1]} r={radius*.52} fill="#fff0c1"/>
    {arches.map(({z,color,edge}) => {
      const inner=outline(2.13,4.11,z)
      const outer=outline(2.75,4.82,z)
      return <g key={z}>
        <path d={path(outer)+path(inner)} fill={color} fillRule="evenodd"/>
        <polyline points={line(outline(2.33,4.35,z))} fill="none" stroke={edge} strokeWidth="1.1" opacity=".58"/>
        <polyline points={line(inner)} fill="none" stroke={edge} strokeWidth="2.4"/>
        <polyline points={line([inner[1],inner[2],inner[3]])} fill="none" stroke="#db9a72" strokeWidth="1.9" opacity=".62"/>
        <polygon points={line(plane(2.29,2.43,.51,.87,z))} fill="#aeadab" opacity=".65"/>
      </g>
    })}
    <polygon points={line([[wallX,-7,wallZ],[wallX,-7,wallFar],[wallX,10,wallFar],[wallX,10,wallZ]])} fill="#2b3944" stroke="#48565b"/>
    <polygon points={line(plane(-10,wallX,-7,10,wallZ))} fill="url(#front)"/>
    <g clipPath="url(#wall)">
      {[-.25,.56,1.55,2.53,3.64,4.67].map(y =>
        <polyline key={y} points={line([[-10,y,wallZ],[wallX,y,wallZ]])} stroke="#657982" opacity=".26" fill="none"/>)}
      <polygon points={line(plane(wallX-.61,wallX-.28,.33,3.9,wallZ))} fill="#111d29" opacity=".7" />
    </g>
    <polyline points={line([[wallX,-7,wallZ],[wallX,10,wallZ]])} stroke="#617785" strokeWidth="2" fill="none"/>
  </svg>
}

registerRoot(()=><Composition id="ProsvetGateA" component={Shot}
  width={width} height={height} fps={fps} durationInFrames={frames}/>)
