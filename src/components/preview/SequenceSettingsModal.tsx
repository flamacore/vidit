import { useEffect, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'

const PRESETS: { label: string; width: number; height: number }[] = [
  { label: '4K UHD', width: 3840, height: 2160 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: 'Vertical 1080', width: 1080, height: 1920 },
  { label: 'Square', width: 1080, height: 1080 },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function SequenceSettingsModal({ open, onClose }: Props) {
  const settings = useProjectStore((s) => s.settings)
  const updateSettings = useProjectStore((s) => s.updateSettings)
  const [width, setWidth] = useState(String(settings.width))
  const [height, setHeight] = useState(String(settings.height))
  const [fps, setFps] = useState(String(settings.fps))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setWidth(String(settings.width))
    setHeight(String(settings.height))
    setFps(String(settings.fps))
    setError('')
  }, [open, settings.width, settings.height, settings.fps])

  if (!open) return null

  const apply = () => {
    const w = Number(width)
    const h = Number(height)
    const f = Number(fps)
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(f)) {
      setError('Enter valid numbers for width, height, and frame rate.')
      return
    }
    if (w < 16 || h < 16 || w > 8192 || h > 8192) {
      setError('Resolution must be between 16×16 and 8192×8192.')
      return
    }
    if (f < 1 || f > 240) {
      setError('Frame rate must be between 1 and 240 fps.')
      return
    }
    updateSettings({ width: w, height: h, fps: f })
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      data-testid="sequence-settings-modal"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sequence settings</h2>
        <p className="modal-hint">
          Sets the project canvas size used for preview and export. Clip positions stay
          normalized; only the frame dimensions change.
        </p>
        <div className="field">
          <label>Preset</label>
          <div className="row">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn"
                onClick={() => {
                  setWidth(String(p.width))
                  setHeight(String(p.height))
                  setError('')
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row sequence-size-fields">
          <div className="field">
            <label htmlFor="seq-width">Width</label>
            <input
              id="seq-width"
              type="number"
              min={16}
              max={8192}
              step={2}
              value={width}
              data-testid="sequence-width"
              onChange={(e) => setWidth(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="seq-height">Height</label>
            <input
              id="seq-height"
              type="number"
              min={16}
              max={8192}
              step={2}
              value={height}
              data-testid="sequence-height"
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="seq-fps">Frame rate</label>
            <input
              id="seq-fps"
              type="number"
              min={1}
              max={240}
              step={0.001}
              value={fps}
              data-testid="sequence-fps"
              onChange={(e) => setFps(e.target.value)}
            />
          </div>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className="btn"
            title="Swap width and height"
            onClick={() => {
              setWidth(height)
              setHeight(width)
            }}
          >
            Swap orientation
          </button>
        </div>
        {error ? <p style={{ color: 'var(--danger)', margin: '0 0 8px' }}>{error}</p> : null}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="sequence-settings-apply"
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
