import type { ModelClip } from '../../types/project'
import { useProjectStore } from '../../store/projectStore'

interface Props {
  value: ModelClip
  onChange: (patch: Partial<ModelClip>) => void
}

export function ObjectTransformControls({ value, onChange }: Props) {
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)

  const num = (
    label: string,
    key: keyof ModelClip,
    min: number,
    max: number,
    step: number,
    display?: (n: number) => string,
  ) => (
    <div className="field" key={key}>
      <label>
        {label} —{' '}
        {display
          ? display(value[key] as number)
          : Number(value[key] as number).toFixed(2)}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[key] as number}
        onPointerDown={() => beginGesture()}
        onPointerUp={() => endGesture()}
        onPointerCancel={() => endGesture()}
        onChange={(e) => onChange({ [key]: Number(e.target.value) })}
      />
    </div>
  )

  return (
    <div className="inspector-section">
      <h3>Object transform</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 0 }}>
        Moves the 3D model in scene space (not the 2D frame transform below).
      </p>
      {num('Position X', 'posX', -50, 50, 0.01)}
      {num('Position Y', 'posY', -50, 50, 0.01)}
      {num('Position Z', 'posZ', -50, 50, 0.01)}
      {num('Rotation X', 'rotX', -180, 180, 1, (n) => `${Math.round(n)}°`)}
      {num('Rotation Y', 'rotY', -180, 180, 1, (n) => `${Math.round(n)}°`)}
      {num('Rotation Z', 'rotZ', -180, 180, 1, (n) => `${Math.round(n)}°`)}
      {num('Scale X', 'objScaleX', 0.05, 10, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Scale Y', 'objScaleY', 0.05, 10, 0.01, (n) => `${Math.round(n * 100)}%`)}
      {num('Scale Z', 'objScaleZ', 0.05, 10, 0.01, (n) => `${Math.round(n * 100)}%`)}
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              objScaleY: value.objScaleX,
              objScaleZ: value.objScaleX,
            })
          }
        >
          Uniform scale
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              posX: 0,
              posY: 0,
              posZ: 0,
              rotX: 0,
              rotY: 0,
              rotZ: 0,
              objScaleX: 1,
              objScaleY: 1,
              objScaleZ: 1,
            })
          }
        >
          Reset
        </button>
      </div>
    </div>
  )
}
