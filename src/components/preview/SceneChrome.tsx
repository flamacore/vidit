import { Camera, Sun } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useProjectStore } from '../../store/projectStore'

type Panel = 'camera' | 'light'

function PopoverPortal({
  anchor,
  children,
  onClose,
  testId,
}: {
  anchor: HTMLElement | null
  children: ReactNode
  onClose: () => void
  testId: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const panelH = panelRef.current?.offsetHeight ?? 360
      const panelW = 280
      const gap = 8
      let top = r.top - panelH - gap
      if (top < 8) top = r.bottom + gap
      let left = r.left + r.width / 2 - panelW / 2
      left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8))
      top = Math.max(8, Math.min(top, window.innerHeight - panelH - 8))
      setPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
    }
    place()
    // Reposition after paint once height is known
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
    }
  }, [anchor])

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchor?.contains(t)) return
      // Native OS color picker: clicks land outside the panel while input stays focused
      const active = document.activeElement
      if (active instanceof HTMLInputElement && active.type === 'color') return
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    // Defer so the opening click doesn't immediately close
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc, true)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor])

  return createPortal(
    <div
      ref={panelRef}
      className="scene-popover scene-popover-portal"
      data-testid={testId}
      style={{ top: pos.top, left: pos.left, width: 280 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

function useGestureField() {
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)
  return {
    onPointerDown: () => beginGesture(),
    onPointerUp: () => endGesture(),
    onPointerCancel: () => endGesture(),
  }
}

function LightPanel() {
  const light = useProjectStore((s) => s.light)
  const updateLight = useProjectStore((s) => s.updateLight)
  const g = useGestureField()
  // Keep color uncontrolled-while-focused so the native picker doesn't remount/flicker
  const [colorDraft, setColorDraft] = useState<string | null>(null)
  const colorValue = colorDraft ?? light.color

  return (
    <>
      <h4>Directional light</h4>
      <label className="field">
        Intensity — {light.intensity.toFixed(2)}
        <input
          type="range"
          min={0}
          max={50}
          step={0.05}
          value={Math.min(50, light.intensity)}
          {...g}
          onChange={(e) => updateLight({ intensity: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Intensity (exact)
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={Number(light.intensity.toFixed(2))}
          onFocus={() => useProjectStore.getState().beginGesture()}
          onBlur={() => useProjectStore.getState().endGesture()}
          onChange={(e) => updateLight({ intensity: Number(e.target.value) || 0 })}
        />
      </label>
      <label className="field">
        Color
        <input
          type="color"
          value={colorValue}
          onFocus={() => {
            useProjectStore.getState().beginGesture()
            setColorDraft(light.color)
          }}
          onBlur={() => {
            if (colorDraft) updateLight({ color: colorDraft })
            setColorDraft(null)
            useProjectStore.getState().endGesture()
          }}
          onChange={(e) => {
            setColorDraft(e.target.value)
            updateLight({ color: e.target.value })
          }}
        />
      </label>
      <label className="field">
        Shadow opacity — {Math.round(light.shadowOpacity * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={light.shadowOpacity}
          {...g}
          onChange={(e) => updateLight({ shadowOpacity: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Direction yaw — {Math.round(light.yaw)}°
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={light.yaw}
          {...g}
          onChange={(e) => updateLight({ yaw: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Direction pitch — {Math.round(light.pitch)}°
        <input
          type="range"
          min={5}
          max={89}
          step={1}
          value={light.pitch}
          {...g}
          onChange={(e) => updateLight({ pitch: Number(e.target.value) })}
        />
      </label>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={light.castShadows}
          onChange={(e) => updateLight({ castShadows: e.target.checked })}
        />
        Cast shadows
      </label>
    </>
  )
}

function CameraPanel() {
  const camera = useProjectStore((s) => s.camera)
  const updateCamera = useProjectStore((s) => s.updateCamera)
  const g = useGestureField()

  return (
    <>
      <h4>Scene camera</h4>
      <label className="field">
        Position X — {(camera.posX ?? 0).toFixed(2)}
        <input
          type="range"
          min={-50}
          max={50}
          step={0.01}
          value={camera.posX ?? 0}
          {...g}
          onChange={(e) => updateCamera({ posX: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Position Y — {(camera.posY ?? 0).toFixed(2)}
        <input
          type="range"
          min={-50}
          max={50}
          step={0.01}
          value={camera.posY ?? 0}
          {...g}
          onChange={(e) => updateCamera({ posY: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Position Z — {(camera.posZ ?? 0).toFixed(2)}
        <input
          type="range"
          min={-50}
          max={50}
          step={0.01}
          value={camera.posZ ?? 0}
          {...g}
          onChange={(e) => updateCamera({ posZ: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Yaw — {Math.round(camera.yaw)}°
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={camera.yaw}
          {...g}
          onChange={(e) => updateCamera({ yaw: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Pitch — {Math.round(camera.pitch)}°
        <input
          type="range"
          min={-89}
          max={89}
          step={1}
          value={camera.pitch}
          {...g}
          onChange={(e) => updateCamera({ pitch: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Distance —{' '}
        {camera.distance >= 100 ? Math.round(camera.distance) : camera.distance.toFixed(1)}
        <input
          type="range"
          min={0.5}
          max={3000}
          step={camera.distance > 100 ? 10 : camera.distance > 20 ? 1 : 0.1}
          value={Math.min(3000, Math.max(0.5, camera.distance))}
          {...g}
          onChange={(e) => updateCamera({ distance: Number(e.target.value) })}
        />
      </label>
      <label className="field">
        Distance (exact)
        <input
          type="number"
          min={0.5}
          max={3000}
          step={1}
          value={Number(camera.distance.toFixed(2))}
          onFocus={() => useProjectStore.getState().beginGesture()}
          onBlur={() => useProjectStore.getState().endGesture()}
          onChange={(e) => updateCamera({ distance: Number(e.target.value) || 0.5 })}
        />
      </label>
      <label className="field">
        FOV — {Math.round(camera.fov)}°
        <input
          type="range"
          min={15}
          max={100}
          step={1}
          value={camera.fov}
          {...g}
          onChange={(e) => updateCamera({ fov: Number(e.target.value) })}
        />
      </label>
    </>
  )
}

export function SceneChrome() {
  const threeDEnabled = useProjectStore((s) => s.settings.threeDEnabled)
  const [open, setOpen] = useState<Panel | null>(null)
  const lightBtnRef = useRef<HTMLButtonElement>(null)
  const cameraBtnRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(null), [])

  if (!threeDEnabled) return null

  return (
    <div className="scene-chrome" data-testid="scene-chrome">
      <button
        ref={lightBtnRef}
        type="button"
        className={`btn btn-icon ${open === 'light' ? 'active' : ''}`}
        title="Directional light"
        data-testid="scene-light-btn"
        onClick={() => setOpen((v) => (v === 'light' ? null : 'light'))}
      >
        <Sun size={15} />
      </button>
      <button
        ref={cameraBtnRef}
        type="button"
        className={`btn btn-icon ${open === 'camera' ? 'active' : ''}`}
        title="Scene camera"
        data-testid="scene-camera-btn"
        onClick={() => setOpen((v) => (v === 'camera' ? null : 'camera'))}
      >
        <Camera size={15} />
      </button>

      {open === 'light' ? (
        <PopoverPortal anchor={lightBtnRef.current} testId="scene-light-panel" onClose={close}>
          <LightPanel />
        </PopoverPortal>
      ) : null}

      {open === 'camera' ? (
        <PopoverPortal anchor={cameraBtnRef.current} testId="scene-camera-panel" onClose={close}>
          <CameraPanel />
        </PopoverPortal>
      ) : null}
    </div>
  )
}
