import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

/** Raw FBX roots (not normalized) so each instance can be fit independently. */
const rawCache = new Map<string, THREE.Group>()
const loader = new FBXLoader()

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Absolute local paths → `vidit-media://local/<base64url>`; otherwise return as-is. */
export function mediaUrlForPath(filePath: string): string {
  if (/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(filePath)) {
    return window.vidit?.toMediaUrl(filePath) ?? `vidit-media://local/${toBase64Url(filePath)}`
  }
  return filePath
}

function prepareMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    obj.matrixAutoUpdate = true
    if (obj instanceof THREE.SkinnedMesh) {
      obj.frustumCulled = false
      obj.skeleton?.update()
    } else if (obj instanceof THREE.Mesh) {
      obj.frustumCulled = false
    }
  })
}

/** Center at origin and fit into a ~2-unit box so scale 1 fills the default view. */
function normalizeModel(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  prepareMeshes(root)

  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return

  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
  const fit = 2 / maxDim

  root.scale.multiplyScalar(fit)
  root.position.x -= center.x * fit
  root.position.y -= center.y * fit
  root.position.z -= center.z * fit
  root.updateMatrixWorld(true)
  prepareMeshes(root)
}

/**
 * Load an FBX and return a fresh hierarchy under an `fbx-fit` group (normalized).
 * Parent this under the user pivot for object transforms.
 */
export async function loadFbx(url: string): Promise<THREE.Group> {
  const resolved = mediaUrlForPath(url)
  const key = `raw:${resolved}`
  let raw = rawCache.get(key)
  if (!raw) {
    raw = await loader.loadAsync(resolved)
    rawCache.set(key, raw)
  }

  const clone = raw.clone(true)
  const fit = new THREE.Group()
  fit.name = 'fbx-fit'
  fit.add(clone)
  normalizeModel(fit)
  return fit
}
