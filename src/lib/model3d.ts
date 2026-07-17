import type {
  ModelClip,
  ModelMaterial,
  PbrMaps,
  ProjectCamera,
  ProjectLight,
  TextureChannel,
  TextureSlot,
} from '../types/project'
import { DEFAULT_TRANSFORM } from './elementTransform'

export type { TextureChannel }

export const DEFAULT_CAMERA: ProjectCamera = {
  posX: 0,
  posY: 0,
  posZ: 0,
  yaw: 35,
  pitch: 15,
  distance: 6,
  fov: 45,
}

export const DEFAULT_LIGHT: ProjectLight = {
  intensity: 1.2,
  color: '#ffffff',
  shadowOpacity: 0.55,
  yaw: -40,
  pitch: 50,
  castShadows: true,
}

export const DEFAULT_PBR: PbrMaps = {}

export const DEFAULT_PBR_MATERIAL: ModelMaterial = {
  mode: 'pbr',
  pbr: { ...DEFAULT_PBR },
}

export const DEFAULT_OBJECT_TRANSFORM = {
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  objScaleX: 1,
  objScaleY: 1,
  objScaleZ: 1,
}

export function defaultTextureSlot(partial?: Partial<TextureSlot>): TextureSlot {
  return {
    metallicChannel: 'r',
    roughnessChannel: 'g',
    aoChannel: 'r',
    ...partial,
  }
}

export function withModelDefaults(
  m: Partial<ModelClip> & Pick<ModelClip, 'id' | 'trackId' | 'assetId' | 'start' | 'duration'>,
): ModelClip {
  const material = m.material ?? DEFAULT_PBR_MATERIAL
  return {
    ...DEFAULT_OBJECT_TRANSFORM,
    ...DEFAULT_TRANSFORM,
    castShadows: true,
    ...m,
    material:
      material.mode === 'custom'
        ? {
            mode: 'custom',
            vertexShader: material.vertexShader,
            fragmentShader: material.fragmentShader ?? '',
            textures: { ...(material.textures ?? {}) },
          }
        : {
            mode: 'pbr',
            pbr: { ...(material.pbr ?? {}) },
          },
  }
}

export function makeModelClip(
  assetId: string,
  trackId: string,
  start: number,
  duration: number,
  id: string,
): ModelClip {
  return withModelDefaults({
    id,
    assetId,
    trackId,
    start: Math.max(0, start),
    duration: Math.max(0.1, duration),
  })
}

/** Scan GLSL for `uniform sampler2D name` declarations. */
export function scanSampler2DUniforms(source: string): string[] {
  const re = /uniform\s+sampler2D\s+(\w+)\s*;/g
  const names: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const name = m[1]!
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export function cameraPosition(cam: ProjectCamera): { x: number; y: number; z: number } {
  const yaw = (cam.yaw * Math.PI) / 180
  const pitch = (cam.pitch * Math.PI) / 180
  const d = Math.max(0.1, cam.distance)
  const cp = Math.cos(pitch)
  const tx = cam.posX ?? 0
  const ty = cam.posY ?? 0
  const tz = cam.posZ ?? 0
  return {
    x: tx + d * Math.sin(yaw) * cp,
    y: ty + d * Math.sin(pitch),
    z: tz + d * Math.cos(yaw) * cp,
  }
}

export function cameraTarget(cam: ProjectCamera): { x: number; y: number; z: number } {
  return { x: cam.posX ?? 0, y: cam.posY ?? 0, z: cam.posZ ?? 0 }
}

export function lightDirection(light: ProjectLight): { x: number; y: number; z: number } {
  const yaw = (light.yaw * Math.PI) / 180
  const pitch = (light.pitch * Math.PI) / 180
  const cp = Math.cos(pitch)
  // Direction *from* light toward origin (Three directional light position)
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cp,
  }
}
