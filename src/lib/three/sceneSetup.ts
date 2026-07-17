import * as THREE from 'three'
import { cameraPosition, cameraTarget, lightDirection } from '../model3d'
import type { ProjectCamera, ProjectLight } from '../../types/project'

export function createModelScene(opts: {
  width: number
  height: number
  camera: ProjectCamera
  light: ProjectLight
}): {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  dirLight: THREE.DirectionalLight
  ambient: THREE.AmbientLight
  shadowPlane: THREE.Mesh
} {
  const { width, height, camera: cam, light } = opts

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = light.castShadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()

  const aspect = width / Math.max(1, height)
  const camera = new THREE.PerspectiveCamera(cam.fov, aspect, 0.01, 100_000)
  const pos = cameraPosition(cam)
  const target = cameraTarget(cam)
  camera.position.set(pos.x, pos.y, pos.z)
  camera.lookAt(target.x, target.y, target.z)

  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambient)

  const dir = lightDirection(light)
  const lightReach = Math.max(20, cam.distance * 3)
  const dirLight = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity)
  dirLight.position.set(dir.x * lightReach, dir.y * lightReach, dir.z * lightReach)
  dirLight.castShadow = light.castShadows
  dirLight.shadow.mapSize.set(2048, 2048)
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = lightReach * 4
  const shadowExtent = Math.max(12, cam.distance)
  dirLight.shadow.camera.left = -shadowExtent
  dirLight.shadow.camera.right = shadowExtent
  dirLight.shadow.camera.top = shadowExtent
  dirLight.shadow.camera.bottom = -shadowExtent
  scene.add(dirLight)

  const shadowMat = new THREE.ShadowMaterial({ opacity: light.shadowOpacity })
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), shadowMat)
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = 0
  shadowPlane.receiveShadow = true
  shadowPlane.castShadow = false
  scene.add(shadowPlane)

  return { scene, camera, renderer, dirLight, ambient, shadowPlane }
}
