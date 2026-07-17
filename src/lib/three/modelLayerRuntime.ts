import * as THREE from 'three'
import { useProjectStore } from '../../store/projectStore'
import type { MediaAsset, ModelClip, ProjectCamera, ProjectLight } from '../../types/project'
import { applyCamera, applyLight } from './applyCameraLight'
import { applyModelMaterial } from './applyMaterial'
import { applyObjectTransform } from './applyObjectTransform'
import { loadFbx, mediaUrlForPath } from './loadFbx'
import { createModelScene } from './sceneSetup'

type Runtime = {
  clipId: string
  ctx: ReturnType<typeof createModelScene>
  pivot: THREE.Group
  model: THREE.Object3D | null
  host: HTMLElement
  raf: number
  width: number
  height: number
  camera: ProjectCamera
  light: ProjectLight
  assets: MediaAsset[]
  active: boolean
  materialKey: string
  loadGen: number
}

const runtimes = new Map<string, Runtime>()

function readClip(clipId: string): ModelClip | undefined {
  return useProjectStore.getState().modelClips.find((m) => m.id === clipId)
}

function syncSkeleton(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh) {
      obj.frustumCulled = false
      obj.skeleton?.update()
    } else if (obj instanceof THREE.Mesh) {
      obj.frustumCulled = false
    }
  })
}

function tick(rt: Runtime): void {
  if (!runtimes.has(rt.clipId)) return

  const clip = readClip(rt.clipId)
  if (clip) {
    applyObjectTransform(rt.pivot, clip)
  }
  rt.pivot.updateMatrixWorld(true)
  if (rt.model) syncSkeleton(rt.model)

  applyCamera(rt.ctx.camera, rt.camera, rt.width / Math.max(1, rt.height))
  applyLight(rt.ctx.dirLight, rt.ctx.shadowPlane, rt.light, rt.ctx.renderer, rt.camera.distance)

  // Always render while mounted — CSS opacity hides inactive clips.
  rt.ctx.renderer.render(rt.ctx.scene, rt.ctx.camera)
  rt.raf = requestAnimationFrame(() => tick(rt))
}

export function mountModelLayer(opts: {
  clipId: string
  host: HTMLElement
  assetPath: string
  width: number
  height: number
  camera: ProjectCamera
  light: ProjectLight
  assets: MediaAsset[]
  active: boolean
}): void {
  disposeModelLayer(opts.clipId)

  const ctx = createModelScene({
    width: opts.width,
    height: opts.height,
    camera: opts.camera,
    light: opts.light,
  })
  const pivot = new THREE.Group()
  pivot.name = 'user-pivot'
  ctx.scene.add(pivot)

  ctx.renderer.domElement.style.width = '100%'
  ctx.renderer.domElement.style.height = '100%'
  ctx.renderer.domElement.style.display = 'block'
  opts.host.replaceChildren(ctx.renderer.domElement)

  const rt: Runtime = {
    clipId: opts.clipId,
    ctx,
    pivot,
    model: null,
    host: opts.host,
    raf: 0,
    width: opts.width,
    height: opts.height,
    camera: opts.camera,
    light: opts.light,
    assets: opts.assets,
    active: opts.active,
    materialKey: '',
    loadGen: 0,
  }
  runtimes.set(opts.clipId, rt)

  const clip = readClip(opts.clipId)
  if (clip) applyObjectTransform(pivot, clip)

  const gen = ++rt.loadGen
  void (async () => {
    try {
      const group = await loadFbx(mediaUrlForPath(opts.assetPath))
      if (!runtimes.has(opts.clipId) || rt.loadGen !== gen) return
      while (pivot.children.length) pivot.remove(pivot.children[0]!)
      pivot.add(group)
      rt.model = group
      syncSkeleton(group)
      const latest = readClip(opts.clipId)
      if (latest) {
        applyObjectTransform(pivot, latest)
        await applyModelMaterial(
          group,
          latest.material,
          rt.assets,
          latest.castShadows,
          rt.light.castShadows,
        )
        rt.materialKey =
          JSON.stringify(latest.material) +
          String(latest.castShadows) +
          String(rt.light.castShadows)
      }
    } catch (err) {
      console.error('FBX load failed', opts.assetPath, err)
      if (!runtimes.has(opts.clipId) || rt.loadGen !== gen) return
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1.5, 1),
        new THREE.MeshStandardMaterial({ color: 0x44ddaa }),
      )
      while (pivot.children.length) pivot.remove(pivot.children[0]!)
      pivot.add(fallback)
      rt.model = fallback
    }
  })()

  rt.raf = requestAnimationFrame(() => tick(rt))
}

export function updateModelLayer(
  clipId: string,
  patch: Partial<{
    width: number
    height: number
    camera: ProjectCamera
    light: ProjectLight
    assets: MediaAsset[]
    active: boolean
  }>,
): void {
  const rt = runtimes.get(clipId)
  if (!rt) return
  if (
    patch.width != null &&
    patch.height != null &&
    (patch.width !== rt.width || patch.height !== rt.height)
  ) {
    rt.width = patch.width
    rt.height = patch.height
    rt.ctx.renderer.setSize(patch.width, patch.height, false)
  }
  if (patch.camera) rt.camera = patch.camera
  if (patch.light) rt.light = patch.light
  if (patch.assets) rt.assets = patch.assets
  if (patch.active != null) rt.active = patch.active

  const clip = readClip(clipId)
  if (clip && rt.model) {
    const key =
      JSON.stringify(clip.material) + String(clip.castShadows) + String(rt.light.castShadows)
    if (key !== rt.materialKey) {
      rt.materialKey = key
      void applyModelMaterial(
        rt.model,
        clip.material,
        rt.assets,
        clip.castShadows,
        rt.light.castShadows,
      )
    }
  }
}

export function disposeModelLayer(clipId: string): void {
  const rt = runtimes.get(clipId)
  if (!rt) return
  cancelAnimationFrame(rt.raf)
  rt.loadGen++
  rt.ctx.scene.remove(rt.pivot)
  rt.ctx.renderer.dispose()
  rt.host.replaceChildren()
  runtimes.delete(clipId)
}
