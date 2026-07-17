import { useRef, type PointerEvent } from 'react'
import { timeToPx, pxToTime } from '../../lib/timelineMath'
import { useProjectStore } from '../../store/projectStore'
import type { MediaAsset, ModelClip } from '../../types/project'

function trackIdAtPoint(clientX: number, clientY: number): string | undefined {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const el of stack) {
    const lane = (el as HTMLElement).closest?.('[data-track-id]')
    if (lane) return lane.getAttribute('data-track-id') ?? undefined
  }
  return undefined
}

interface Props {
  clip: ModelClip
  asset?: MediaAsset
  zoom: number
  selected: boolean
}

export function ModelBlock({ clip, asset, zoom, selected }: Props) {
  const selectTimelineModel = useProjectStore((s) => s.selectTimelineModel)
  const moveModelsFromOrigins = useProjectStore((s) => s.moveModelsFromOrigins)
  const finalizeModelDrag = useProjectStore((s) => s.finalizeModelDrag)
  const trimModel = useProjectStore((s) => s.trimModel)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)
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
    const state = useProjectStore.getState()
    const inMulti = state.selectedModelIds.includes(clip.id) && state.selectedModelIds.length > 1
    if (mode === 'move') {
      if (e.shiftKey) selectTimelineModel(clip.id, 'range')
      else if (e.ctrlKey || e.metaKey) selectTimelineModel(clip.id, 'toggle')
      else if (!inMulti) selectTimelineModel(clip.id, 'replace')
    }

    const after = useProjectStore.getState()
    const ids =
      after.selectedModelIds.includes(clip.id) && after.selectedModelIds.length > 0
        ? after.selectedModelIds
        : [clip.id]
    const origins: Record<string, number> = {}
    for (const id of ids) {
      const m = after.modelClips.find((x) => x.id === id)
      if (m) origins[id] = m.start
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
    const dt = pxToTime(e.clientX - dragRef.current.startX, zoom)
    if (dragRef.current.mode === 'move') {
      const primaryOrig = dragRef.current.origins[dragRef.current.primaryId] ?? 0
      const trackId = trackIdAtPoint(e.clientX, e.clientY)
      moveModelsFromOrigins(
        dragRef.current.origins,
        dragRef.current.primaryId,
        Math.max(0, primaryOrig + dt),
        trackId,
      )
    } else if (dragRef.current.mode === 'in') {
      trimModel(clip.id, 'in', dragRef.current.edgeOrig + dt)
    } else {
      trimModel(clip.id, 'out', dragRef.current.edgeOrig + dt)
    }
  }

  const onPointerUp = (e: PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.mode === 'move') {
      const primary = useProjectStore.getState().modelClips.find((c) => c.id === drag.primaryId)
      const trackId = trackIdAtPoint(e.clientX, e.clientY) ?? primary?.trackId
      if (primary && trackId) finalizeModelDrag(drag.ids, trackId, primary.start)
    }
    endGesture()
  }

  return (
    <div
      className={`clip model ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      data-testid={`model-clip-${clip.id}`}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="clip-handle left" onPointerDown={(e) => onPointerDown(e, 'in')} />
      <div className="clip-label">{asset?.name ?? '3D'}</div>
      <div className="clip-handle right" onPointerDown={(e) => onPointerDown(e, 'out')} />
    </div>
  )
}
