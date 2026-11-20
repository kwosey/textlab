export const backgrounds = ['Off', 'Gradient Drift', 'Flow', 'Grain'] as const
export const shapes = ['Circle', 'Line', 'Rectangle'] as const
export const shapeMotions = ['Hold', 'Expand', 'Drift'] as const
export const sceneTones = ['Accent', 'Cool', 'Ink'] as const
export const typeMotions = ['Off', 'Punch', 'Slide', 'Oversized'] as const

export type Background = {kind: typeof backgrounds[number]; intensity?: number; speed?: number; scale?: number}
export type Graphic = {
  kind: typeof shapes[number]; motion?: typeof shapeMotions[number]; tone?: typeof sceneTones[number]
  x?: number; y?: number; size?: number; energy?: number
}
export type TypeMotion = {kind: typeof typeMotions[number]; amount?: number}
export type Scene = {background?: Background; shapes?: Graphic[]; typeMotion?: TypeMotion}

export const backgroundDefaults = {intensity: 55, speed: 1, scale: 100}
export const graphicDefaults = {motion: 'Hold', tone: 'Accent', x: 50, y: 48, size: 43, energy: 60} as const
export const typeMotionDefaults = {amount: 60}
export const maxShapes = 3

function fields(value: unknown, allowed: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).every(key => allowed.includes(key))
}
const optionalRange = (value: unknown, min: number, max: number) =>
  value === undefined || typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const member = (value: unknown, list: readonly unknown[]) => list.includes(value)

export function validScene(scene: unknown): scene is Scene {
  if (!fields(scene, ['background', 'shapes', 'typeMotion'])) return false
  const {background, shapes: graphics, typeMotion} = scene
  if (background !== undefined && (!fields(background, ['kind', 'intensity', 'speed', 'scale']) ||
      !member(background.kind, backgrounds) || !optionalRange(background.intensity, 0, 100) ||
      !optionalRange(background.speed, 0, 2) || !optionalRange(background.scale, 50, 150))) return false
  if (typeMotion !== undefined && (!fields(typeMotion, ['kind', 'amount']) ||
      !member(typeMotion.kind, typeMotions) || !optionalRange(typeMotion.amount, 0, 100))) return false
  return graphics === undefined || Array.isArray(graphics) && graphics.length <= maxShapes && graphics.every(shape =>
    fields(shape, ['kind', 'motion', 'tone', 'x', 'y', 'size', 'energy']) &&
    member(shape.kind, shapes) && (shape.motion === undefined || member(shape.motion, shapeMotions)) &&
    (shape.tone === undefined || member(shape.tone, sceneTones)) &&
    optionalRange(shape.x, -100, 200) && optionalRange(shape.y, -100, 200) &&
    optionalRange(shape.size, 8, 240) && optionalRange(shape.energy, 0, 100))
}
