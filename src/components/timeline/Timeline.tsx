import {
  ChevronDown,
  ChevronUp,
  Film,
  Magnet,
  Maximize2,
  Scissors,
  MousePointer2,
  AudioLines,
  ZoomIn,
  ZoomOut,
  VolumeX,
  Volume2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, type DragEvent, type PointerEvent, type WheelEvent } from 'react'
import { getSequenceDuration, useProjectStore } from '../../store/projectStore'
import { clamp, formatTimecode, pxToTime, timeToPx } from '../../lib/timelineMath'
import { ClipBlock, TextBlock } from './ClipBlock'

/** Must match `--track-label-w` in editor.css */
const TRACK_LABEL_W = 120

/** Isolated so clip rows don't re-render at playback tick rate */
function TimelinePlayhead({
  zoom,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  zoom: number
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void
}) {
  const playhead = useProjectStore((s) => s.playhead)
  return (
    <div
      className="playhead"
      data-testid="playhead"
      style={{ left: TRACK_LABEL_W + timeToPx(playhead, zoom) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="playhead-hit" />
    </div>
  )
}

export function Timeline() {
  const tracks = useProjectStore((s) => s.tracks)
  const clips = useProjectStore((s) => s.clips)
  const textClips = useProjectStore((s) => s.textClips)
  const assets = useProjectStore((s) => s.assets)
  const zoom = useProjectStore((s) => s.zoom)
  const snapEnabled = useProjectStore((s) => s.snapEnabled)
  const tool = useProjectStore((s) => s.tool)
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds)
  const selectedTextIds = useProjectStore((s) => s.selectedTextIds)
  const setZoom = useProjectStore((s) => s.setZoom)
  const setPlayhead = useProjectStore((s) => s.setPlayhead)
  const setPlaying = useProjectStore((s) => s.setPlaying)
  const toggleSnap = useProjectStore((s) => s.toggleSnap)
  const setTool = useProjectStore((s) => s.setTool)
  const addClipsFromAssets = useProjectStore((s) => s.addClipsFromAssets)
  const toggleTrackMute = useProjectStore((s) => s.toggleTrackMute)
  const addTrack = useProjectStore((s) => s.addTrack)
  const moveTrack = useProjectStore((s) => s.moveTrack)
  const reorderTrack = useProjectStore((s) => s.reorderTrack)
  const clearTimelineSelection = useProjectStore((s) => s.clearTimelineSelection)

  const scrollRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const dragTrackId = useRef<string | null>(null)

  const duration = Math.max(getSequenceDuration(), 12)
  const laneWidth = timeToPx(duration + 4, zoom)
  const canvasWidth = TRACK_LABEL_W + laneWidth
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])

  const ticks = useMemo(() => {
    const step = zoom < 0.4 ? 5 : zoom < 1 ? 2 : 1
    const list: number[] = []
    for (let t = 0; t <= duration + 4; t += step) list.push(t)
    return list
  }, [duration, zoom])

  const timeFromClientX = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - TRACK_LABEL_W
    return Math.max(0, pxToTime(x, zoom))
  }

  const startScrub = (e: PointerEvent) => {
    if (e.altKey || e.button === 1) return
    e.preventDefault()
    e.stopPropagation()
    scrubbing.current = true
    setPlaying(false)
    setPlayhead(timeFromClientX(e.clientX))
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onScrubMove = (e: PointerEvent) => {
    if (!scrubbing.current) return
    setPlayhead(timeFromClientX(e.clientX))
  }

  const endScrub = () => {
    scrubbing.current = false
  }

  const hasTrackDrag = (e: DragEvent) =>
    Array.from(e.dataTransfer.types).includes('application/vidit-track') ||
    Boolean(dragTrackId.current)

  const onLaneDrop = (e: DragEvent, trackId: string) => {
    e.preventDefault()
    if (hasTrackDrag(e)) return
    let ids: string[] = []
    const multi = e.dataTransfer.getData('application/vidit-assets')
    if (multi) {
      try {
        ids = JSON.parse(multi) as string[]
      } catch {
        ids = []
      }
    }
    if (ids.length === 0) {
      const one = e.dataTransfer.getData('application/vidit-asset')
      if (one) ids = [one]
    }
    if (ids.length === 0 || !scrollRef.current) return
    const start = timeFromClientX(e.clientX)
    addClipsFromAssets(ids, trackId, start)
  }

  const onWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cursorX = e.clientX - rect.left + el.scrollLeft - TRACK_LABEL_W
    const timeAtCursor = pxToTime(cursorX, zoom)
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15
    const nextZoom = clamp(zoom * factor, 0.15, 8)
    setZoom(nextZoom)
    requestAnimationFrame(() => {
      const sc = scrollRef.current
      if (!sc) return
      const newX = TRACK_LABEL_W + timeToPx(timeAtCursor, nextZoom)
      sc.scrollLeft = Math.max(0, newX - (e.clientX - rect.left))
    })
  }

  const onPanPointerDown = (e: PointerEvent) => {
    const altPan = e.altKey && e.button === 0
    const middlePan = e.button === 1
    if (!altPan && !middlePan) return
    e.preventDefault()
    e.stopPropagation()
    const el = scrollRef.current
    if (!el) return
    panning.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    }
    el.setPointerCapture(e.pointerId)
  }

  const onPanPointerMove = (e: PointerEvent) => {
    if (!panning.current || !scrollRef.current) return
    const dx = e.clientX - panning.current.x
    const dy = e.clientY - panning.current.y
    scrollRef.current.scrollLeft = panning.current.left - dx
    scrollRef.current.scrollTop = panning.current.top - dy
  }

  const endPan = () => {
    panning.current = null
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const prevent = (ev: Event) => {
      const we = ev as globalThis.WheelEvent
      if (we.ctrlKey || we.metaKey) we.preventDefault()
    }
    el.addEventListener('wheel', prevent, { passive: false })
    return () => el.removeEventListener('wheel', prevent)
  }, [])

  return (
    <section className="timeline" data-testid="timeline">
      <div className="timeline-toolbar">
        <button
          type="button"
          className={`btn btn-icon ${tool === 'select' ? 'active' : ''}`}
          title="Select (A)"
          data-testid="tool-select"
          onClick={() => setTool('select')}
        >
          <MousePointer2 size={15} />
        </button>
        <button
          type="button"
          className={`btn btn-icon ${tool === 'razor' ? 'active' : ''}`}
          title="Razor (R)"
          data-testid="tool-razor"
          onClick={() => setTool('razor')}
        >
          <Scissors size={15} />
        </button>
        <button
          type="button"
          className={`btn btn-icon ${snapEnabled ? 'active' : ''}`}
          title="Snap (N)"
          data-testid="tool-snap"
          onClick={toggleSnap}
        >
          <Magnet size={15} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Add video track"
          data-testid="add-video-track"
          onClick={() => addTrack('video')}
        >
          <Film size={15} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Add audio track"
          data-testid="add-audio-track"
          onClick={() => addTrack('audio')}
        >
          <AudioLines size={15} />
        </button>
        <span className="timeline-hint">
          Ctrl+wheel zoom · Alt/middle-drag pan · Ctrl/Shift multi-select
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-icon" title="Zoom out" onClick={() => setZoom(zoom / 1.25)}>
          <ZoomOut size={15} />
        </button>
        <button type="button" className="btn btn-icon" title="Zoom in" onClick={() => setZoom(zoom * 1.25)}>
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Fit"
          onClick={() => {
            const el = scrollRef.current
            if (!el) return
            const usable = Math.max(80, el.clientWidth - TRACK_LABEL_W)
            const fit = usable / (80 * Math.max(duration, 1))
            setZoom(fit)
            el.scrollLeft = 0
          }}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div
        className="tracks-scroll"
        ref={scrollRef}
        data-testid="timeline-scroll"
        onWheel={onWheel}
        onPointerDown={onPanPointerDown}
        onPointerMove={(e) => {
          onPanPointerMove(e)
          onScrubMove(e)
        }}
        onPointerUp={() => {
          endPan()
          endScrub()
        }}
        onPointerCancel={() => {
          endPan()
          endScrub()
        }}
      >
        <div className="timeline-canvas" style={{ width: canvasWidth }}>
          <div className="timeline-corner" />
          <div
            className="ruler"
            style={{ width: laneWidth }}
            data-testid="timeline-ruler"
            onPointerDown={(e) => {
              if (e.altKey || e.button === 1) return
              clearTimelineSelection()
              startScrub(e)
            }}
            onPointerMove={onScrubMove}
            onPointerUp={endScrub}
          >
            {ticks.map((t) => (
              <div key={t} className="ruler-tick" style={{ left: timeToPx(t, zoom) }}>
                {formatTimecode(t)}
              </div>
            ))}
          </div>

          {tracks.map((track, index) => (
            <div key={track.id} className="timeline-row">
              <div
                className="track-label"
                style={{ height: track.height }}
                draggable
                data-testid={`track-label-${track.id}`}
                onDragStart={(e) => {
                  dragTrackId.current = track.id
                  e.dataTransfer.setData('application/vidit-track', track.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  dragTrackId.current = null
                }}
                onDragOver={(e) => {
                  if (!hasTrackDrag(e)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const from =
                    e.dataTransfer.getData('application/vidit-track') || dragTrackId.current
                  if (from) reorderTrack(from, track.id)
                  dragTrackId.current = null
                }}
              >
                <span className="track-label-name" title="Drag to reorder">
                  {track.name}
                </span>
                <div className="track-label-actions">
                  <button
                    type="button"
                    className="btn-ghost track-move-btn"
                    title="Move track up"
                    disabled={index === 0}
                    data-testid={`track-up-${track.id}`}
                    onClick={() => moveTrack(track.id, 'up')}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost track-move-btn"
                    title="Move track down"
                    disabled={index === tracks.length - 1}
                    data-testid={`track-down-${track.id}`}
                    onClick={() => moveTrack(track.id, 'down')}
                  >
                    <ChevronDown size={12} />
                  </button>
                  {track.kind !== 'text' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      title="Mute"
                      onClick={() => toggleTrackMute(track.id)}
                    >
                      {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>
                  ) : null}
                </div>
              </div>
              <div
                className="track-lane"
                data-track-id={track.id}
                style={{ width: laneWidth, height: track.height }}
                onDragOver={(e) => {
                  if (hasTrackDrag(e)) return
                  e.preventDefault()
                }}
                onDrop={(e) => onLaneDrop(e, track.id)}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('.clip')) return
                  if (e.altKey || e.button === 1) return
                  clearTimelineSelection()
                  startScrub(e)
                }}
              >
                {track.kind === 'text'
                  ? textClips
                      .filter((c) => c.trackId === track.id)
                      .map((c) => (
                        <TextBlock
                          key={c.id}
                          clip={c}
                          zoom={zoom}
                          selected={selectedTextIds.includes(c.id)}
                        />
                      ))
                  : clips
                      .filter((c) => c.trackId === track.id)
                      .map((c) => (
                        <ClipBlock
                          key={c.id}
                          clip={c}
                          asset={assetMap.get(c.assetId)}
                          zoom={zoom}
                          selected={selectedClipIds.includes(c.id)}
                          kind={track.kind === 'audio' ? 'audio' : 'video'}
                        />
                      ))}
              </div>
            </div>
          ))}

          <TimelinePlayhead
            zoom={zoom}
            onPointerDown={(e) => {
              e.stopPropagation()
              startScrub(e)
            }}
            onPointerMove={onScrubMove}
            onPointerUp={endScrub}
          />
        </div>
      </div>
    </section>
  )
}
