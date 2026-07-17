import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { transformStyle, withTransform } from '../../lib/elementTransform'
import { useProjectStore } from '../../store/projectStore'
import {
  disposeModelLayer,
  mountModelLayer,
  updateModelLayer,
} from '../../lib/three/modelLayerRuntime'
import type { MediaAsset, ProjectCamera, ProjectLight } from '../../types/project'

interface Props {
  clipId: string
  asset: MediaAsset
  camera: ProjectCamera
  light: ProjectLight
  width: number
  height: number
  active: boolean
  zIndex: number
  mixBlendMode: string
  assets: MediaAsset[]
}

export function PreviewModelLayer({
  clipId,
  asset,
  camera,
  light,
  width,
  height,
  active,
  zIndex,
  mixBlendMode,
  assets,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frame = useProjectStore(
    useShallow((s) => {
      const m = s.modelClips.find((c) => c.id === clipId)
      if (!m) return null
      return {
        x: m.x,
        y: m.y,
        scaleX: m.scaleX,
        scaleY: m.scaleY,
        rotation: m.rotation,
        opacity: m.opacity,
        cropL: m.cropL,
        cropR: m.cropR,
        cropT: m.cropT,
        cropB: m.cropB,
      }
    }),
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    mountModelLayer({
      clipId,
      host,
      assetPath: asset.path,
      width,
      height,
      camera,
      light,
      assets,
      active,
    })
    return () => disposeModelLayer(clipId)
    // Mount once per clip/asset — live camera/light/transform flow via update + RAF
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, asset.path])

  useEffect(() => {
    updateModelLayer(clipId, { camera, light, assets, active, width, height })
  }, [clipId, camera, light, assets, active, width, height])

  const xform = transformStyle(withTransform(frame ?? {}))
  const slotStyle: CSSProperties = {
    zIndex,
    opacity: active && frame ? xform.opacity : 0,
    pointerEvents: 'none',
    mixBlendMode: mixBlendMode as CSSProperties['mixBlendMode'],
  }

  return (
    <div className="preview-layer-slot preview-model-slot" style={slotStyle}>
      <div
        className="preview-layer-xform"
        style={{
          left: xform.left,
          top: xform.top,
          transform: xform.transform,
          clipPath: xform.clipPath,
        }}
      >
        <div ref={hostRef} className="preview-model-canvas" data-vidit-layer={`model:${clipId}`} />
      </div>
    </div>
  )
}
