import { useRef, type PointerEvent } from 'react'
import { timeToPx, pxToTime } from '../../lib/timelineMath'
import { useProjectStore } from '../../store/projectStore'
import type { MediaAsset, TextClip, TimelineClip } from '../../types/project'

function trackIdAtPoint(clientX: number, clientY: number): string | undefined {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const el of stack) {
    const lane = (el as HTMLElement).closest?.('[data-track-id]')
    if (lane) return lane.getAttribute('data-track-id') ?? undefined
  }
  return undefined
}

interface ClipBlockProps {
  clip: TimelineClip
  asset?: MediaAsset
  zoom: number
  selected: boolean
  kind?: 'video' | 'audio'
}

export function ClipBlock({ clip, asset, zoom, selected, kind = 'video' }: ClipBlockProps) {
  const selectTimelineClip = useProjectStore((s) => s.selectTimelineClip)
  const moveClipsFromOrigins = useProjectStore((s) => s.moveClipsFromOrigins)
  const finalizeClipDrag = useProjectStore((s) => s.finalizeClipDrag)
  const trimClip = useProjectStore((s) => s.trimClip)
  const splitAtPlayhead = useProjectStore((s) => s.splitAtPlayhead)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)
  const tool = useProjectStore((s) => s.tool)
  const dragRef = useRef<{
    mode: 'move' | 'in' | 'out'
    startX: number
    origins: Record<string, number>
    primaryId: string
    edgeOrig: number
    ids: string[]
  } | null>(null)

  const left = timeToPx(clip.start, zoom)
  const width = Math.max(8, timeToPx(clip.duration, zoom))

  const onPointerDown = (e: PointerEvent, mode: 'move' | 'in' | 'out') => {
    e.stopPropagation()
    if (tool === 'razor') {
      useProjectStore.getState().setPlayhead(clip.start + pxToTime(e.nativeEvent.offsetX, zoom))
      splitAtPlayhead()
      return
    }

    const state = useProjectStore.getState()
    const inMulti = state.selectedClipIds.includes(clip.id) && state.selectedClipIds.length > 1
    if (mode === 'move') {
      if (e.shiftKey) selectTimelineClip(clip.id, 'range')
      else if (e.ctrlKey || e.metaKey) selectTimelineClip(clip.id, 'toggle')
      else if (!inMulti) selectTimelineClip(clip.id, 'replace')
    }

    const after = useProjectStore.getState()
    const ids =
      after.selectedClipIds.includes(clip.id) && after.selectedClipIds.length > 0
        ? after.selectedClipIds
        : [clip.id]
    const origins: Record<string, number> = {}
    for (const id of ids) {
      const c = after.clips.find((x) => x.id === id)
      if (c) origins[id] = c.start
    }

    beginGesture()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      mode,
      startX: e.clientX,
      origins,
      primaryId: clip.id,
      edgeOrig: mode === 'in' ? clip.start : clip.start + clip.duration,
      ids,
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dt = pxToTime(dx, zoom)
    if (dragRef.current.mode === 'move') {
      const primaryOrig = dragRef.current.origins[dragRef.current.primaryId] ?? 0
      const trackId = trackIdAtPoint(e.clientX, e.clientY)
      moveClipsFromOrigins(
        dragRef.current.origins,
        dragRef.current.primaryId,
        Math.max(0, primaryOrig + dt),
        trackId,
      )
    } else if (dragRef.current.mode === 'in') {
      trimClip(clip.id, 'in', dragRef.current.edgeOrig + dt)
    } else {
      trimClip(clip.id, 'out', dragRef.current.edgeOrig + dt)
    }
  }

  const onPointerUp = (e: PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.mode === 'move') {
      const primary = useProjectStore.getState().clips.find((c) => c.id === drag.primaryId)
      const trackId = trackIdAtPoint(e.clientX, e.clientY) ?? primary?.trackId
      if (primary && trackId) {
        finalizeClipDrag(drag.ids, trackId, primary.start)
      }
    }
    endGesture()
  }

  return (
    <div
      className={`clip ${kind} ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="clip-handle left" onPointerDown={(e) => onPointerDown(e, 'in')} />
      <div className="clip-label">{asset?.name ?? 'Clip'}</div>
      {asset?.thumbnail ? (
        <div className="clip-filmstrip" style={{ backgroundImage: `url(${asset.thumbnail})` }} />
      ) : null}
      <div className="clip-handle right" onPointerDown={(e) => onPointerDown(e, 'out')} />
    </div>
  )
}

interface TextBlockProps {
  clip: TextClip
  zoom: number
  selected: boolean
}

export function TextBlock({ clip, zoom, selected }: TextBlockProps) {
  const selectTimelineText = useProjectStore((s) => s.selectTimelineText)
  const moveTextsFromOrigins = useProjectStore((s) => s.moveTextsFromOrigins)
  const trimText = useProjectStore((s) => s.trimText)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)
  const dragRef = useRef<{
    mode: 'move' | 'in' | 'out'
    startX: number
    origins: Record<string, number>
    primaryId: string
    edgeOrig: number
  } | null>(null)
  const left = timeToPx(clip.start, zoom)
  const width = Math.max(8, timeToPx(clip.duration, zoom))

  const onPointerDown = (e: PointerEvent, mode: 'move' | 'in' | 'out') => {
    e.stopPropagation()
    const state = useProjectStore.getState()
    const inMulti = state.selectedTextIds.includes(clip.id) && state.selectedTextIds.length > 1
    if (mode === 'move') {
      if (e.shiftKey) selectTimelineText(clip.id, 'range')
      else if (e.ctrlKey || e.metaKey) selectTimelineText(clip.id, 'toggle')
      else if (!inMulti) selectTimelineText(clip.id, 'replace')
    }

    const after = useProjectStore.getState()
    const ids =
      after.selectedTextIds.includes(clip.id) && after.selectedTextIds.length > 0
        ? after.selectedTextIds
        : [clip.id]
    const origins: Record<string, number> = {}
    for (const id of ids) {
      const t = after.textClips.find((x) => x.id === id)
      if (t) origins[id] = t.start
    }

    beginGesture()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      mode,
      startX: e.clientX,
      origins,
      primaryId: clip.id,
      edgeOrig: mode === 'in' ? clip.start : clip.start + clip.duration,
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return
    const dt = pxToTime(e.clientX - dragRef.current.startX, zoom)
    if (dragRef.current.mode === 'move') {
      const primaryOrig = dragRef.current.origins[dragRef.current.primaryId] ?? 0
      moveTextsFromOrigins(
        dragRef.current.origins,
        dragRef.current.primaryId,
        Math.max(0, primaryOrig + dt),
      )
    } else if (dragRef.current.mode === 'in') {
      trimText(clip.id, 'in', dragRef.current.edgeOrig + dt)
    } else {
      trimText(clip.id, 'out', dragRef.current.edgeOrig + dt)
    }
  }

  return (
    <div
      className={`clip text ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        dragRef.current = null
        endGesture()
      }}
    >
      <div className="clip-handle left" onPointerDown={(e) => onPointerDown(e, 'in')} />
      <div className="clip-label">{clip.text}</div>
      <div className="clip-handle right" onPointerDown={(e) => onPointerDown(e, 'out')} />
    </div>
  )
}
