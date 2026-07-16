import { useEffect, useState } from 'react'
import type { ExportCodec, ExportContainer } from '../../../electron/types'
import { buildExportPlan } from '../../lib/renderPlan'
import { useProjectStore } from '../../store/projectStore'

export function ExportModal() {
  const open = useProjectStore((s) => s.exportOpen)
  const setExportOpen = useProjectStore((s) => s.setExportOpen)
  const settings = useProjectStore((s) => s.settings)
  const assets = useProjectStore((s) => s.assets)
  const tracks = useProjectStore((s) => s.tracks)
  const clips = useProjectStore((s) => s.clips)
  const textClips = useProjectStore((s) => s.textClips)

  const [container, setContainer] = useState<ExportContainer>('mp4')
  const [codec, setCodec] = useState<ExportCodec>('h264')
  const [busy, setBusy] = useState(false)
  const [percent, setPercent] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !window.vidit) return
    return window.vidit.onExportProgress((p) => {
      setPercent(p.percent)
      setMessage(p.message)
    })
  }, [open])

  useEffect(() => {
    if (codec === 'prores') setContainer('mov')
  }, [codec])

  if (!open) return null

  const onExport = async () => {
    if (!window.vidit) {
      setError('Export requires the desktop app.')
      return
    }
    if (clips.length === 0 && textClips.length === 0) {
      setError('Add something to the timeline first.')
      return
    }
    setError('')
    setBusy(true)
    setPercent(0)
    setMessage('Choose save location…')
    const ext = codec === 'prores' || container === 'mov' ? 'mov' : 'mp4'
    const out = await window.vidit.showSaveDialog(`vidit-export.${ext}`)
    if (!out) {
      setBusy(false)
      return
    }
    try {
      const plan = buildExportPlan({
        settings,
        assets,
        tracks,
        clips,
        textClips,
        container: codec === 'prores' ? 'mov' : container,
        codec,
        outputPath: out,
      })
      await window.vidit.exportProject(plan)
      setMessage('Export complete')
      setPercent(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" data-testid="export-modal" onClick={() => !busy && setExportOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>
        <div className="field">
          <label>Container</label>
          <select
            value={container}
            disabled={codec === 'prores' || busy}
            onChange={(e) => setContainer(e.target.value as ExportContainer)}
          >
            <option value="mp4">MP4</option>
            <option value="mov">MOV</option>
          </select>
        </div>
        <div className="field">
          <label>Codec</label>
          <select
            value={codec}
            disabled={busy}
            onChange={(e) => setCodec(e.target.value as ExportCodec)}
          >
            <option value="h264">H.264</option>
            <option value="h265">H.265</option>
            <option value="prores">ProRes (MOV)</option>
          </select>
        </div>
        <div className="field">
          <label>Sequence</label>
          <input
            type="text"
            readOnly
            value={`${settings.width}×${settings.height} @ ${settings.fps}fps`}
          />
        </div>
        {message ? <p style={{ color: 'var(--text-muted)', margin: '8px 0 0' }}>{message}</p> : null}
        {busy || percent > 0 ? (
          <div className="progress-bar">
            <i style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        {error ? <p style={{ color: 'var(--danger)', marginTop: 10, whiteSpace: 'pre-wrap' }}>{error}</p> : null}
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" disabled={busy} onClick={() => setExportOpen(false)}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onExport}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
