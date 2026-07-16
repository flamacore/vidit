import { withTransform, type ElementTransform } from '../../lib/elementTransform'

interface Props {
  /** Current values (primary element) */
  value: Partial<ElementTransform>
  onChange: (patch: Partial<ElementTransform>) => void
  title?: string
}

export function TransformControls({ value, onChange, title = 'Transform' }: Props) {
  const t = withTransform(value)

  const num = (
    label: string,
    key: keyof ElementTransform,
    min: number,
    max: number,
    step: number,
    display?: (n: number) => string,
  ) => (
    <div className="field" key={key}>
      <label>
        {label} — {display ? display(t[key] as number) : Number(t[key]).toFixed(2)}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={t[key] as number}
        onChange={(e) => onChange({ [key]: Number(e.target.value) })}
      />
    </div>
  )

  return (
    <div className="inspector-section">
      <h3>{title}</h3>
      {num('Position X', 'x', 0, 1, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Position Y', 'y', 0, 1, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Scale X', 'scaleX', 0.05, 3, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Scale Y', 'scaleY', 0.05, 3, 0.01, (n) => `${Math.round(n * 100)}%`)}
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() => onChange({ scaleY: t.scaleX })}
          title="Match scale Y to X"
        >
          Lock scale
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              x: 0.5,
              y: 0.5,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              cropL: 0,
              cropR: 0,
              cropT: 0,
              cropB: 0,
            })
          }
        >
          Reset
        </button>
      </div>
      {num('Rotation', 'rotation', -180, 180, 1, (n) => `${Math.round(n)}°`)}
      {num('Opacity', 'opacity', 0, 1, 0.01, (n) => `${Math.round(n * 100)}%`)}
      <h3 style={{ marginTop: 12 }}>Crop</h3>
      {num('Left', 'cropL', 0, 0.45, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Right', 'cropR', 0, 0.45, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Top', 'cropT', 0, 0.45, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Bottom', 'cropB', 0, 0.45, 0.01, (n) => `${Math.round(n * 100)}%`)}
    </div>
  )
}
