import * as THREE from 'three'
import { cameraPosition, cameraTarget, lightDirection } from '../model3d'
import type { ProjectCamera, ProjectLight } from '../../types/project'

export function applyCamera(
  cam: THREE.PerspectiveCamera,
  camera: ProjectCamera,
  aspect: number,
): void {
  cam.fov = camera.fov
  cam.aspect = aspect
  cam.near = 0.01
  cam.far = Math.max(100_000, camera.distance * 50)
  const pos = cameraPosition(camera)
  const target = cameraTarget(camera)
  cam.position.set(pos.x, pos.y, pos.z)
  cam.lookAt(target.x, target.y, target.z)
  cam.updateProjectionMatrix()
}

export function applyLight(
  dirLight: THREE.DirectionalLight,
  shadowPlane: THREE.Mesh,
  light: ProjectLight,
  renderer: THREE.WebGLRenderer,
  cameraDistance = 6,
): void {
  const dir = lightDirection(light)
  const lightReach = Math.max(20, cameraDistance * 3)
  dirLight.position.set(dir.x * lightReach, dir.y * lightReach, dir.z * lightReach)
  dirLight.color.set(light.color)
  dirLight.intensity = light.intensity
  dirLight.castShadow = light.castShadows
  renderer.shadowMap.enabled = light.castShadows
  dirLight.shadow.camera.far = lightReach * 4
  const shadowExtent = Math.max(12, cameraDistance)
  dirLight.shadow.camera.left = -shadowExtent
  dirLight.shadow.camera.right = shadowExtent
  dirLight.shadow.camera.top = shadowExtent
  dirLight.shadow.camera.bottom = -shadowExtent
  dirLight.shadow.camera.updateProjectionMatrix()

  const mat = shadowPlane.material
  if (mat instanceof THREE.ShadowMaterial) {
    mat.opacity = light.shadowOpacity
    mat.needsUpdate = true
  }
}
