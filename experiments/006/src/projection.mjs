export const geometry = {
  width: 540, height: 960, fps: 30, frames: 150, focal: 455,
  wallEdge: [-.14, 2.65, 2.4],
  portalEdge: [2.13, 2.65, 5.15],
  light: [.85, 2.65, 12.8],
  lightRadius: .55,
}

export function cameraAt(frame) {
  const t = Math.min(1, Math.max(0, frame / 131))
  const p = t*t*(3-2*t)
  return {x: -1.32 + 2.08*p, y: 1.65, z: -1 + 1.64*p}
}

export function project([x, y, z], camera) {
  const scale = geometry.focal / (z - camera.z)
  return [270 + (x-camera.x)*scale, 418 - (y-camera.y)*scale]
}

export function landmarks(frame) {
  const camera = cameraAt(frame)
  return {
    wall: project(geometry.wallEdge, camera)[0],
    portal: project(geometry.portalEdge, camera)[0],
    lamp: project(geometry.light, camera)[0],
    lampRadius: geometry.lightRadius * geometry.focal / (geometry.light[2] - camera.z),
  }
}
