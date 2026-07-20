import { useEffect, useState } from 'react'
import { subscribePreviewLevels } from '../../lib/previewAudioBus'

function toDb(linear: number): string {
  if (linear < 0.0001) return '-∞'
  const db = 20 * Math.log10(linear)
  return `${db.toFixed(0)}`
}

/** Vertical-ish master meter in the transport — shows preview signal even if speakers are muted. */
export function MasterLevelMeter() {
  const [level, setLevel] = useState(0)
  const [peak, setPeak] = useState(0)

  useEffect(() => subscribePreviewLevels((rms, pk) => {
    setLevel(rms)
    setPeak(pk)
  }), [])

  const fill = Math.min(1, level * 2.2)
  const peakPct = Math.min(100, peak * 220)
  const hot = fill > 0.85

  return (
    <div
      className="master-level-meter"
      data-testid="master-level-meter"
      title={`Master level ${toDb(level)} dBFS (preview bus — independent of system mute)`}
    >
      <span className="master-level-label">LVL</span>
      <div className="master-level-track">
        <i
          className={`master-level-fill${hot ? ' hot' : ''}`}
          style={{ transform: `scaleX(${fill})` }}
        />
        <b className="master-level-peak" style={{ left: `${peakPct}%` }} />
      </div>
      <span className="master-level-db">{toDb(level)}</span>
    </div>
  )
}
