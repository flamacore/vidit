import { useEffect, useMemo, useState } from 'react'
import type { ExportCodec, ExportContainer, ExportRateControl } from '../../../electron/types'
import {
  formatExportSizeEstimate,
  suggestVideoBitrateKbps,
} from '../../../shared/exportBitrate'
import { bakeTextClip } from '../../lib/bakeTextClip'
import { buildExportPlan } from '../../lib/renderPlan'
import { bakeModelClip } from '../../lib/three/bakeModelClip'
import { getSequenceDuration, useProjectStore } from '../../store/projectStore'
import type { ModelClip, TextClip } from '../../types/project'

type CrfPreset = 'higher' | 'balanced' | 'smaller'

const CRF_PRESETS: Record<CrfPreset, { h264: number; h265: number; label: string }> = {
  higher: { h264: 16, h265: 18, label: 'Higher quality' },
  balanced: { h264: 20, h265: 22, label: 'Balanced' },
  smaller: { h264: 26, h265: 28, label: 'Smaller file' },
}

const VIDEO_BITRATE_PRESETS_MBPS = [4, 8, 12, 20, 35, 50] as const
const AUDIO_BITRATE_PRESETS = [128, 192, 256, 320] as const

export function ExportModal() {
  const open = useProjectStore((s) => s.exportOpen)
  const setExportOpen = useProjectStore((s) => s.setExportOpen)
  const settings = useProjectStore((s) => s.settings)
  const assets = useProjectStore((s) => s.assets)
  const tracks = useProjectStore((s) => s.tracks)
  const clips = useProjectStore((s) => s.clips)
  const textClips = useProjectStore((s) => s.textClips)
  const modelClips = useProjectStore((s) => s.modelClips)
  const camera = useProjectStore((s) => s.camera)
  const light = useProjectStore((s) => s.light)

  const [container, setContainer] = useState<ExportContainer>('mp4')
  const [codec, setCodec] = useState<ExportCodec>('h264')
  const [rateControl, setRateControl] = useState<ExportRateControl>('bitrate')
  const [crfPreset, setCrfPreset] = useState<CrfPreset>('balanced')
  const [videoMbps, setVideoMbps] = useState('')
  const [audioKbps, setAudioKbps] = useState(192)
  const [busy, setBusy] = useState(false)
  const [percent, setPercent] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  const suggestedKbps = useMemo(
    () => suggestVideoBitrateKbps(settings.width, settings.height, settings.fps),
    [settings.width, settings.height, settings.fps],
  )

  useEffect(() => {
    if (!open) return
    setVideoMbps((suggestedKbps / 1000).toFixed(suggestedKbps >= 10_000 ? 0 : 1))
  }, [open, suggestedKbps])

  useEffect(() => {
    if (!open || !window.vidit) return
    return window.vidit.onExportProgress((p) => {
      setPercent(p.percent)
      setMessage(p.message)
      if (p.previewDataUrl) setPreviewUrl(p.previewDataUrl)
    })
  }, [open])

  useEffect(() => {
    if (codec === 'prores') setContainer('mov')
  }, [codec])

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setPercent(0)
      setMessage('')
      setError('')
      setPreviewUrl('')
    }
  }, [open])

  if (!open) return null

  const duration = getSequenceDuration()
  const videoKbps = Math.round(Math.max(0.2, Number(videoMbps) || suggestedKbps / 1000) * 1000)
  const crf =
    codec === 'h265' ? CRF_PRESETS[crfPreset].h265 : CRF_PRESETS[crfPreset].h264
  const sizeHint =
    codec === 'prores'
      ? 'ProRes size is profile-based (large)'
      : rateControl === 'bitrate'
        ? `Est. ${formatExportSizeEstimate(duration, videoKbps, audioKbps)}`
        : `Est. varies with content · CRF ${crf}`

  const onExport = async () => {
    if (!window.vidit) {
      setError('Export requires the desktop app.')
      return
    }
    if (clips.length === 0 && textClips.length === 0 && modelClips.length === 0) {
      setError('Add something to the timeline first.')
      return
    }
    if (codec !== 'prores' && rateControl === 'bitrate') {
      const mbps = Number(videoMbps)
      if (!Number.isFinite(mbps) || mbps < 0.2 || mbps > 200) {
        setError('Video bitrate must be between 0.2 and 200 Mbps.')
        return
      }
    }
    setError('')
    setBusy(true)
    setPercent(0)
    setPreviewUrl('')
    setMessage('Choose save location…')
    const ext = codec === 'prores' || container === 'mov' ? 'mov' : 'mp4'
    const out = await window.vidit.showSaveDialog(`vidit-export.${ext}`)
    if (!out) {
      setBusy(false)
      return
    }
    try {
      const trackOrder = tracks.map((t) => t.id)
      const bakedModels: Array<{ clip: ModelClip; path: string }> = []
      if (settings.threeDEnabled) {
        const activeModels = modelClips.filter((m) => {
          const tr = tracks.find((t) => t.id === m.trackId)
          return tr && tr.kind === 'model' && !tr.muted
        })
        for (let i = 0; i < activeModels.length; i++) {
          const clip = activeModels[i]!
          const asset = assets.find((a) => a.id === clip.assetId)
          if (!asset) continue
          setMessage(`Baking 3D ${i + 1}/${activeModels.length}…`)
          const path = await bakeModelClip({
            clip,
            asset,
            assets,
            camera,
            light,
            width: settings.width,
            height: settings.height,
            fps: settings.fps,
            onProgress: (pct, msg) => {
              setPercent(Math.round((i / Math.max(1, activeModels.length)) * 40 + pct * 0.4))
              setMessage(msg)
            },
          })
          bakedModels.push({ clip, path })
        }
      }

      const visualTrackIndices = [
        ...clips.map((c) => trackOrder.indexOf(c.trackId)),
        ...bakedModels.map((b) => trackOrder.indexOf(b.clip.trackId)),
      ].filter((i) => i >= 0)

      const bakedTexts: Array<{ clip: TextClip; path: string }> = []
      const drawTexts: TextClip[] = []
      for (const clip of textClips) {
        const ti = trackOrder.indexOf(clip.trackId)
        // Text needs bake when a visual layer sits above it (lower track index)
        const coveredByVisual = visualTrackIndices.some((vi) => vi < ti)
        if (coveredByVisual) {
          setMessage('Baking mid-stack text…')
          const path = await bakeTextClip({
            clip,
            width: settings.width,
            height: settings.height,
            fps: settings.fps,
          })
          bakedTexts.push({ clip, path })
        } else {
          drawTexts.push(clip)
        }
      }

      setMessage('Encoding…')
      const plan = buildExportPlan({
        settings,
        assets,
        tracks,
        clips,
        textClips,
        bakedModels,
        bakedTexts,
        drawTexts,
        container: codec === 'prores' ? 'mov' : container,
        codec,
        outputPath: out,
        rateControl: codec === 'prores' ? 'crf' : rateControl,
        crf,
        videoBitrateKbps: videoKbps,
        audioBitrateKbps: audioKbps,
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

  const showPreview = busy || percent > 0 || Boolean(previewUrl)
  const rateControlsDisabled = codec === 'prores' || busy

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

        {codec === 'prores' ? (
          <p className="modal-hint" style={{ marginTop: 0 }}>
            ProRes uses a fixed HQ profile — bitrate controls do not apply.
          </p>
        ) : (
          <>
            <div className="field">
              <label>Rate control</label>
              <select
                value={rateControl}
                disabled={rateControlsDisabled}
                data-testid="export-rate-control"
                onChange={(e) => setRateControl(e.target.value as ExportRateControl)}
              >
                <option value="bitrate">Target bitrate</option>
                <option value="crf">Quality (CRF)</option>
              </select>
            </div>

            {rateControl === 'bitrate' ? (
              <div className="field">
                <label htmlFor="export-video-bitrate">Video bitrate (Mbps)</label>
                <input
                  id="export-video-bitrate"
                  type="number"
                  min={0.2}
                  max={200}
                  step={0.5}
                  value={videoMbps}
                  disabled={busy}
                  data-testid="export-video-bitrate"
                  onChange={(e) => setVideoMbps(e.target.value)}
                />
                <div className="row" style={{ marginTop: 6 }}>
                  {VIDEO_BITRATE_PRESETS_MBPS.map((mbps) => (
                    <button
                      key={mbps}
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => setVideoMbps(String(mbps))}
                    >
                      {mbps}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    title="Suggested for this sequence size"
                    onClick={() =>
                      setVideoMbps((suggestedKbps / 1000).toFixed(suggestedKbps >= 10_000 ? 0 : 1))
                    }
                  >
                    Auto
                  </button>
                </div>
              </div>
            ) : (
              <div className="field">
                <label>Quality</label>
                <select
                  value={crfPreset}
                  disabled={busy}
                  data-testid="export-crf-preset"
                  onChange={(e) => setCrfPreset(e.target.value as CrfPreset)}
                >
                  {(Object.keys(CRF_PRESETS) as CrfPreset[]).map((key) => (
                    <option key={key} value={key}>
                      {CRF_PRESETS[key].label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label>Audio bitrate</label>
              <select
                value={audioKbps}
                disabled={busy}
                data-testid="export-audio-bitrate"
                onChange={(e) => setAudioKbps(Number(e.target.value))}
              >
                {AUDIO_BITRATE_PRESETS.map((kbps) => (
                  <option key={kbps} value={kbps}>
                    {kbps} kbps
                  </option>
                ))}
              </select>
            </div>

            <p className="export-size-hint" data-testid="export-size-hint">
              {sizeHint}
            </p>
          </>
        )}

        {showPreview ? (
          <div
            className="export-preview"
            data-testid="export-preview"
            style={{ aspectRatio: `${settings.width} / ${settings.height}` }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Encoding preview" />
            ) : (
              <span className="export-preview-placeholder">Waiting for frames…</span>
            )}
          </div>
        ) : null}
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
