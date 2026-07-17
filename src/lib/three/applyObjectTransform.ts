import * as THREE from 'three'
import type { ModelClip } from '../../types/project'

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()

function n(v: unknown, fallback = 0): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : fallback
}

/** Apply inspector object transform onto the user pivot (not the FBX fit node). */
export function applyObjectTransform(obj: THREE.Object3D, clip: ModelClip): void {
  _pos.set(n(clip.posX), n(clip.posY), n(clip.posZ))
  _euler.set(
    (n(clip.rotX) * Math.PI) / 180,
    (n(clip.rotY) * Math.PI) / 180,
    (n(clip.rotZ) * Math.PI) / 180,
    'XYZ',
  )
  _quat.setFromEuler(_euler)
  _scale.set(
    Math.max(0.0001, n(clip.objScaleX, 1)),
    Math.max(0.0001, n(clip.objScaleY, 1)),
    Math.max(0.0001, n(clip.objScaleZ, 1)),
  )
  obj.matrixAutoUpdate = false
  obj.matrix.compose(_pos, _quat, _scale)
  obj.matrixWorldNeedsUpdate = true
}
