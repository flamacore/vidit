import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  computeAlphaInsets,
  elementScreenBounds,
  type AlphaInsets,
  type NormRect,
} from '../../lib/alphaBounds'
import { unionBounds, withTransform } from '../../lib/elementTransform'
import { useProjectStore } from '../../store/projectStore'

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'rotate'

function cropInsets(clip: {
  cropL?: number
  cropR?: number
  cropT?: number
  cropB?: number
}): AlphaInsets {
  return {
    l: clip.cropL ?? 0,
    t: clip.cropT ?? 0,
    r: clip.cropR ?? 0,
    b: clip.cropB ?? 0,
  }
}

function mergeInsets(a: AlphaInsets, b: AlphaInsets): AlphaInsets {
  return {
    l: Math.min(0.49, a.l + b.l * (1 - a.l - a.r)),
    r: Math.min(0.49, a.r + b.r * (1 - a.l - a.r)),
    t: Math.min(0.49, a.t + b.t * (1 - a.t - a.b)),
    b: Math.min(0.49, a.b + b.b * (1 - a.t - a.b)),
  }
}

/** On-canvas handles fitted to visible/alpha content bounds. */
export function TransformOverlay() {
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds)
  const selectedTextIds = useProjectStore((s) => s.selectedTextIds)
  const selection = useProjectStore((s) => s.selection)
  const transformSelection = useProjectStore((s) => s.transformSelection)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<NormRect | null>(null)
  const pivotRef = useRef({ x: 0.5, y: 0.5 })
  const drag = useRef<{
    handle: Handle
    startX: number
    startY: number
    pivotX: number
    pivotY: number
    startDist: number
    startAngle: number
  } | null>(null)

  const clipIds =
    selectedClipIds.length > 0
      ? selectedClipIds
      : selection.type === 'clip'
        ? [selection.id]
        : []
  const textIds =
    selectedTextIds.length > 0
      ? selectedTextIds
      : selection.type === 'text'
        ? [selection.id]
        : []
  const selectionKey = `${clipIds.join(',')}|${textIds.join(',')}`

  useLayoutEffect(() => {
    if (!clipIds.length && !textIds.length) {
      setBox(null)
      return
    }

    let raf = 0
    let alive = true

    const measure = () => {
      const host = overlayRef.current?.parentElement
      if (!host) {
        setBox(null)
        return
      }
      const frame = host.getBoundingClientRect()
      const s = useProjectStore.getState()
      const boxes: NormRect[] = []

      for (const id of clipIds) {
        const c = s.clips.find((x) => x.id === id)
        if (!c) continue
        if (s.playhead < c.start - 1e-4 || s.playhead >= c.start + c.duration) continue
        const nodes = host.querySelectorAll(`[data-vidit-layer="clip:${id}"]`)
        const el = nodes[nodes.length - 1] as HTMLVideoElement | HTMLImageElement | undefined
        if (!el) continue

        let alpha: AlphaInsets = { l: 0, t: 0, r: 0, b: 0 }
        const tr = withTransform(c)
        const ready =
          el instanceof HTMLVideoElement
            ? el.readyState >= 2 && el.videoWidth > 0
            : el instanceof HTMLImageElement
              ? el.complete && el.naturalWidth > 0
              : false
        if (ready) {
          const key =
            el instanceof HTMLVideoElement
              ? `v:${c.assetId}:${Math.floor(el.currentTime * 2)}`
              : `i:${c.assetId}`
          alpha = computeAlphaInsets(el, key)
        }
        alpha = mergeInsets(alpha, cropInsets(tr))
        const b = elementScreenBounds(el, frame, alpha)
        if (b) boxes.push(b)
      }

      for (const id of textIds) {
        const t = s.textClips.find((x) => x.id === id)
        if (!t) continue
        if (s.playhead < t.start - 1e-4 || s.playhead >= t.start + t.duration) continue
        const el = host.querySelector(`[data-vidit-layer="text:${id}"]`)
        if (!el) continue
        const b = elementScreenBounds(el, frame, cropInsets(t))
        if (b) boxes.push(b)
      }

      const next = unionBounds(boxes)
      setBox(next)
      if (next) {
        pivotRef.current = {
          x: (next.minX + next.maxX) / 2,
          y: (next.minY + next.maxY) / 2,
        }
      }
    }

    const tick = () => {
      if (!alive) return
      measure()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionKey captures ids
  }, [selectionKey])

  const toNorm = (e: PointerEvent) => {
    const host = overlayRef.current?.parentElement
    if (!host) return { x: 0, y: 0 }
    const r = host.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) / Math.max(1, r.width),
      y: (e.clientY - r.top) / Math.max(1, r.height),
    }
  }

  const onDown = (e: PointerEvent, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    beginGesture()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const p = toNorm(e)
    const pivotX = pivotRef.current.x
    const pivotY = pivotRef.current.y
    const dx = p.x - pivotX
    const dy = p.y - pivotY
    drag.current = {
      handle,
      startX: p.x,
      startY: p.y,
      pivotX,
      pivotY,
      startDist: Math.hypot(dx, dy) || 0.01,
      startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  }

  const onMove = (e: PointerEvent) => {
    if (!drag.current) return
    const p = toNorm(e)
    const d = drag.current
    if (d.handle === 'move') {
      transformSelection({
        dx: p.x - d.startX,
        dy: p.y - d.startY,
        pivotX: d.pivotX,
        pivotY: d.pivotY,
      })
      d.startX = p.x
      d.startY = p.y
      return
    }
    if (d.handle === 'rotate') {
      const ang = (Math.atan2(p.y - d.pivotY, p.x - d.pivotX) * 180) / Math.PI
      const delta = ang - d.startAngle
      d.startAngle = ang
      transformSelection({ rotation: delta, pivotX: d.pivotX, pivotY: d.pivotY })
      return
    }
    const dist = Math.hypot(p.x - d.pivotX, p.y - d.pivotY) || 0.01
    const scale = dist / d.startDist
    d.startDist = dist
    transformSelection({ scale, pivotX: d.pivotX, pivotY: d.pivotY })
  }

  const onUp = () => {
    drag.current = null
    endGesture()
  }

  const corners: { id: Handle; style: CSSProperties }[] = [
    { id: 'nw', style: { left: 0, top: 0, cursor: 'nwse-resize' } },
    { id: 'ne', style: { left: '100%', top: 0, cursor: 'nesw-resize' } },
    { id: 'sw', style: { left: 0, top: '100%', cursor: 'nesw-resize' } },
    { id: 'se', style: { left: '100%', top: '100%', cursor: 'nwse-resize' } },
  ]

  if (!box && !selectionKey) return null

  const left = box ? box.minX * 100 : 0
  const top = box ? box.minY * 100 : 0
  const width = box ? Math.max(0.5, (box.maxX - box.minX) * 100) : 0
  const height = box ? Math.max(0.5, (box.maxY - box.minY) * 100) : 0

  return (
    <div
      ref={overlayRef}
      className="transform-overlay"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        visibility: box ? 'visible' : 'hidden',
      }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="transform-box" onPointerDown={(e) => onDown(e, 'move')} />
      {corners.map((c) => (
        <div
          key={c.id}
          className="transform-handle"
          style={c.style}
          onPointerDown={(e) => onDown(e, c.id)}
        />
      ))}
      <div
        className="transform-rotate"
        title="Rotate"
        onPointerDown={(e) => onDown(e, 'rotate')}
      />
    </div>
  )
}
