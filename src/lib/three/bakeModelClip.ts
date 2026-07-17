import * as THREE from 'three'
import type { MediaAsset, ModelClip, ProjectCamera, ProjectLight } from '../../types/project'
import { applyCamera, applyLight } from './applyCameraLight'
import { applyModelMaterial } from './applyMaterial'
import { applyObjectTransform } from './applyObjectTransform'
import { loadFbx, mediaUrlForPath } from './loadFbx'
import { createModelScene } from './sceneSetup'

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode PNG frame'))
          return
        }
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject)
      },
      'image/png',
    )
  })
}

/** Render a model clip to a transparent MOV (PNG codec) via temp PNG sequence + ffmpeg. */
export async function bakeModelClip(opts: {
  clip: ModelClip
  asset: MediaAsset
  assets: MediaAsset[]
  camera: ProjectCamera
  light: ProjectLight
  width: number
  height: number
  fps: number
  onProgress?: (pct: number, message: string) => void
}): Promise<string> {
  if (!window.vidit?.createBakeDir || !window.vidit.writeBakeFrame || !window.vidit.encodeBakeDir) {
    throw new Error('Bake API missing')
  }

  const { clip, asset, assets, camera, light, width, height, fps } = opts
  const frameCount = Math.max(1, Math.round(clip.duration * fps))
  const ctx = createModelScene({ width, height, camera, light })
  applyCamera(ctx.camera, camera, width / Math.max(1, height))
  applyLight(ctx.dirLight, ctx.shadowPlane, light, ctx.renderer)

  const pivot = new THREE.Group()
  applyObjectTransform(pivot, clip)
  const group = await loadFbx(mediaUrlForPath(asset.path))
  await applyModelMaterial(group, clip.material, assets, clip.castShadows, light.castShadows)
  pivot.add(group)
  ctx.scene.add(pivot)

  const { dir } = await window.vidit.createBakeDir()
  for (let i = 0; i < frameCount; i++) {
    ctx.renderer.render(ctx.scene, ctx.camera)
    const bytes = await canvasToPngBytes(ctx.renderer.domElement)
    await window.vidit.writeBakeFrame(dir, i, bytes)
    opts.onProgress?.(
      Math.round(((i + 1) / frameCount) * 90),
      `Baking 3D · frame ${i + 1}/${frameCount}`,
    )
  }

  ctx.scene.remove(pivot)
  ctx.renderer.dispose()

  opts.onProgress?.(95, 'Encoding 3D plate…')
  const { path } = await window.vidit.encodeBakeDir(dir, fps)
  opts.onProgress?.(100, '3D plate ready')
  return path
}
