export function Choices<T extends string>({label, values, value, set}: {label: string; values: readonly T[]; value: T | undefined; set: (value: T) => void}) {
  return <div className="choices" role="group" aria-label={label}>
    {values.map(item => <button key={item} type="button" className={value === item ? 'active' : ''} aria-pressed={value === item} onClick={() => set(item)}>{item}</button>)}
  </div>
}
export function Slider({label, value, min, max, step = 1, unit = '', set}: {
  label: string; value: number; min: number; max: number; step?: number | 'any'; unit?: string; set: (value: number) => void
}) {
  return <label className="slider"><span>{label}<output aria-hidden="true">{value}{unit}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => set(e.currentTarget.valueAsNumber)} />
  </label>
}
