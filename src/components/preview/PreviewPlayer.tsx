import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { getBlendMode } from '../../../shared/blendModes'
import { ensureAssetProxies } from '../../lib/importMedia'
import { transformStyle, withTransform } from '../../lib/elementTransform'
import { formatTimecode } from '../../lib/timelineMath'
import {
  buildPreviewTextShadow,
  colorWithAlpha,
  withTextDefaults,
} from '../../lib/textStyle'
import { getSequenceDuration, useProjectStore } from '../../store/projectStore'
import type { MediaAsset, TextClip, TimelineClip, Track } from '../../types/project'
import { AudioOutputSelect, useAudioOutputId } from './AudioOutputSelect'
import { PreviewLayer } from './PreviewLayer'
import { SequenceSettingsModal } from './SequenceSettingsModal'
import { TransformOverlay } from './TransformOverlay'

function layerOpacity(clip: TimelineClip, t: number): number {
  if (clip.transitionIn > 0 && t - clip.start < clip.transitionIn) {
    return Math.max(0, Math.min(1, (t - clip.start) / clip.transitionIn))
  }
  return 1
}

function isActiveAt(clip: TimelineClip, t: number): boolean {
  return t >= clip.start - 1e-4 && t < clip.start + clip.duration
}

function videoLayers(
  clips: TimelineClip[],
  tracks: Track[],
  assets: MediaAsset[],
): { clip: TimelineClip; asset: MediaAsset; z: number }[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]))
  // Timeline list order: top rows composite above bottom rows (V2 over V1)
  const order = [...tracks]
  return clips
    .map((clip) => {
      const asset = assetMap.get(clip.assetId)
      if (!asset) return null
      if (!asset.hasVideo && asset.kind !== 'image') return null
      const idx = order.findIndex((tr) => tr.id === clip.trackId)
      if (idx < 0) return null
      const z = order.length - idx
      return { clip, asset, z }
    })
    .filter((x): x is { clip: TimelineClip; asset: MediaAsset; z: number } => Boolean(x))
    .sort((a, b) => a.z - b.z)
}

function activeTexts(texts: TextClip[], t: number): TextClip[] {
  return texts.filter((tx) => t >= tx.start - 1e-4 && t < tx.start + tx.duration)
}

export function PreviewPlayer() {
  const playhead = useProjectStore((s) => s.playhead)
  const isPlaying = useProjectStore((s) => s.isPlaying)
  const clips = useProjectStore((s) => s.clips)
  const textClips = useProjectStore((s) => s.textClips)
  const assets = useProjectStore((s) => s.assets)
  const tracks = useProjectStore((s) => s.tracks)
  const settings = useProjectStore((s) => s.settings)
  const previewScale = useProjectStore((s) => s.previewScale)
  const setPlayhead = useProjectStore((s) => s.setPlayhead)
  const setPlaying = useProjectStore((s) => s.setPlaying)
  const setPreviewScale = useProjectStore((s) => s.setPreviewScale)
  const [scaleDraft, setScaleDraft] = useState(String(previewScale))
  const [status, setStatus] = useState('')
  const [sequenceOpen, setSequenceOpen] = useState(false)
  const [audioSinkId, setAudioSinkId] = useAudioOutputId()

  const rafRef = useRef(0)
  const lastTs = useRef(0)
  const lastUiEmit = useRef(0)
  const clockRef = useRef(playhead)

  // Keep wall-clock aligned when scrubbing; during play the RAF owns the clock
  useEffect(() => {
    if (!isPlaying) clockRef.current = playhead
  }, [playhead, isPlaying])

  useEffect(() => setScaleDraft(String(previewScale)), [previewScale])

  useEffect(() => {
    const needs = assets.filter(
      (a) => a.hasVideo && a.kind !== 'image' && !a.proxyPath && a.proxyStatus !== 'error',
    )
    if (needs.length) ensureAssetProxies(needs)
  }, [assets])

  const duration = getSequenceDuration()
  // Keep all video layers mounted — switching clips must not re-fetch blobs
  const layers = useMemo(() => videoLayers(clips, tracks, assets), [clips, tracks, assets])
  const texts = useMemo(() => activeTexts(textClips, playhead), [textClips, playhead])
  const anyActive = layers.some((l) => isActiveAt(l.clip, playhead)) || texts.length > 0

  useEffect(() => {
    if (!isPlaying) {
      lastTs.current = 0
      lastUiEmit.current = 0
      cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = (ts: number) => {
      if (!lastTs.current) lastTs.current = ts
      const dt = (ts - lastTs.current) / 1000
      lastTs.current = ts
      const next = clockRef.current + dt
      const dur = getSequenceDuration()
      if (next >= dur) {
        clockRef.current = dur
        useProjectStore.getState().setPlayhead(dur)
        useProjectStore.getState().setPlaying(false)
        return
      }
      clockRef.current = next
      // Video free-runs; only notify React ~30fps (avoids seek/re-render death spiral)
      if (ts - lastUiEmit.current >= 33) {
        lastUiEmit.current = ts
        useProjectStore.getState().setPlayhead(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  const empty = clips.length === 0 && textClips.length === 0
  const noLayer = !empty && !anyActive
  const scale = previewScale / 100

  // Topmost active video/audio layer with audio drives preview sound
  const audioClipId = useMemo(() => {
    const active = layers
      .filter((l) => isActiveAt(l.clip, playhead) && l.asset.hasAudio)
      .sort((a, b) => b.z - a.z)
    const trackMuted = (trackId: string) => tracks.find((t) => t.id === trackId)?.muted
    return active.find((l) => !trackMuted(l.clip.trackId))?.clip.id ?? null
  }, [layers, playhead, tracks])

  return (
    <section className="preview-pane">
      <div className="preview-stage">
        <div className="preview-scale-wrap">
          <div
            className="preview-frame"
            style={
              {
                '--ar-w': settings.width,
                '--ar-h': settings.height,
                transform: scale === 1 ? undefined : `scale(${scale})`,
                transformOrigin: 'center center',
              } as CSSProperties
            }
            data-testid="preview-frame"
          >
            <div className="preview-layers" data-testid="preview-layers">
              {layers.map((layer) => {
                const active = isActiveAt(layer.clip, playhead)
                const blend = getBlendMode(
                  tracks.find((t) => t.id === layer.clip.trackId)?.blendMode,
                )
                return (
                  <PreviewLayer
                    key={layer.clip.id}
                    clip={layer.clip}
                    asset={layer.asset}
                    timelineTime={playhead}
                    isPlaying={isPlaying}
                    active={active}
                    zIndex={10 + layer.z}
                    opacity={active ? layerOpacity(layer.clip, playhead) : 0}
                    mixBlendMode={blend.css}
                    playAudio={layer.clip.id === audioClipId}
                    audioSinkId={audioSinkId}
                    onStatus={active ? setStatus : undefined}
                  />
                )
              })}
            </div>
            {texts.map((raw) => {
              const text = withTextDefaults(raw)
              const xform = transformStyle(withTransform(text))
              const blend = getBlendMode(tracks.find((t) => t.id === text.trackId)?.blendMode)
              return (
                <div
                  key={text.id}
                  className="preview-text-layer"
                  style={{
                    zIndex: 80,
                    mixBlendMode: blend.css as CSSProperties['mixBlendMode'],
                  }}
                >
                  <div
                    className="preview-layer-xform"
                    style={{ left: xform.left, top: xform.top, transform: xform.transform }}
                  >
                    <span
                      data-vidit-layer={`text:${text.id}`}
                      style={{
                        color: colorWithAlpha(text.color, text.opacity * xform.opacity),
                        fontFamily: `${text.fontFamily}, sans-serif`,
                        fontSize: `calc(${text.fontSize / settings.height} * 100cqh)`,
                        fontWeight: text.bold ? 700 : 400,
                        fontStyle: text.italic ? 'italic' : 'normal',
                        WebkitTextStroke: text.outlineEnabled
                          ? `${text.outlineWidth}px ${text.outlineColor}`
                          : undefined,
                        paintOrder: 'stroke fill',
                        textShadow: buildPreviewTextShadow(text),
                        clipPath: xform.clipPath,
                        whiteSpace: 'pre-wrap',
                        textAlign: text.align,
                      }}
                    >
                      {text.text}
                    </span>
                  </div>
                </div>
              )
            })}
            <TransformOverlay />
            {empty ? (
              <div className="preview-placeholder">Drop clips on the timeline to preview</div>
            ) : null}
            {noLayer ? (
              <div className="preview-placeholder">Playhead is in a gap — scrub onto a clip</div>
            ) : null}
          </div>
        </div>
        <div className="preview-meta-row">
          <span className="preview-meta">
            <button
              type="button"
              className="preview-resolution-btn"
              title="Edit sequence size"
              data-testid="sequence-settings-open"
              onClick={() => setSequenceOpen(true)}
            >
              {settings.width}×{settings.height} · {Number(settings.fps.toFixed(3))} fps
            </button>
            {anyActive ? ` · ${layers.filter((l) => isActiveAt(l.clip, playhead)).length || 1} layer` : ''}
            {layers.some((l) => l.asset.proxyStatus === 'pending')
              ? ' · building preview…'
              : layers.some((l) => l.asset.proxyPath)
                ? ' · H.264 proxy'
                : ''}
          </span>
          {status ? <span className="preview-status">{status}</span> : null}
          <label className="preview-scale-control" title="Preview size">
            <span>Scale</span>
            <input
              type="range"
              min={25}
              max={200}
              step={5}
              value={previewScale}
              data-testid="preview-scale-slider"
              onChange={(e) => setPreviewScale(Number(e.target.value))}
            />
            <input
              type="number"
              min={25}
              max={200}
              value={scaleDraft}
              data-testid="preview-scale-input"
              onChange={(e) => setScaleDraft(e.target.value)}
              onBlur={() => {
                const n = Number(scaleDraft)
                if (Number.isFinite(n)) setPreviewScale(n)
                else setScaleDraft(String(previewScale))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <span>%</span>
          </label>
        </div>
      </div>
      <div className="transport">
        <button
          type="button"
          className="btn btn-icon"
          title="Frame back"
          onClick={() => {
            setPlaying(false)
            setPlayhead(Math.max(0, playhead - 1 / settings.fps))
          }}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Play/Pause"
          data-testid="play-pause"
          onClick={() => setPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Frame forward"
          onClick={() => {
            setPlaying(false)
            setPlayhead(playhead + 1 / settings.fps)
          }}
        >
          <SkipForward size={16} />
        </button>
        <div className="timecode" data-testid="timecode">
          {formatTimecode(playhead)} / {formatTimecode(duration)}
        </div>
        <AudioOutputSelect value={audioSinkId} onChange={setAudioSinkId} />
      </div>
      <SequenceSettingsModal open={sequenceOpen} onClose={() => setSequenceOpen(false)} />
    </section>
  )
}
