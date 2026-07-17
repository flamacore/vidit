import * as THREE from 'three'
import { mediaUrlForPath } from './loadFbx'
import type {
  MediaAsset,
  ModelMaterial,
  TextureChannel,
  TextureSlot,
} from '../../types/project'

const texLoader = new THREE.TextureLoader()

const DEFAULT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const CHANNEL_INDEX: Record<TextureChannel, number> = { r: 0, g: 1, b: 2, a: 3 }

function resolveSlotPath(slot: TextureSlot | undefined, assets: MediaAsset[]): string | null {
  if (!slot) return null
  if (slot.path) return slot.path
  if (!slot.assetId) return null
  return assets.find((a) => a.id === slot.assetId)?.path ?? null
}

function loadTexture(path: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      mediaUrlForPath(path),
      (tex) => {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      reject,
    )
  })
}

async function loadSlot(
  slot: TextureSlot | undefined,
  assets: MediaAsset[],
  srgb: boolean,
): Promise<THREE.Texture | null> {
  const path = resolveSlotPath(slot, assets)
  if (!path) return null
  return loadTexture(path, srgb)
}

/** Remap packed MR so metalness → R, roughness → G. */
async function remapMetallicRoughness(
  src: THREE.Texture,
  metalCh: TextureChannel,
  roughCh: TextureChannel,
): Promise<THREE.Texture> {
  if (metalCh === 'r' && roughCh === 'g') return src

  const img = src.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap
  const w = 'width' in img ? img.width : 0
  const h = 'height' in img ? img.height : 0
  if (!w || !h) return src

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(img as CanvasImageSource, 0, 0)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  const mi = CHANNEL_INDEX[metalCh]
  const ri = CHANNEL_INDEX[roughCh]
  for (let i = 0; i < px.length; i += 4) {
    const metal = px[i + mi]!
    const rough = px[i + ri]!
    px[i] = metal
    px[i + 1] = rough
    px[i + 2] = 0
    px[i + 3] = 255
  }
  ctx.putImageData(data, 0, 0)

  const out = new THREE.CanvasTexture(canvas)
  out.colorSpace = THREE.LinearSRGBColorSpace
  out.wrapS = src.wrapS
  out.wrapT = src.wrapT
  out.needsUpdate = true
  return out
}

function hasAnyPbrMap(pbr: Extract<ModelMaterial, { mode: 'pbr' }>['pbr']): boolean {
  return Boolean(
    pbr.albedo?.assetId ||
      pbr.albedo?.path ||
      pbr.normal?.assetId ||
      pbr.normal?.path ||
      pbr.metallicRoughness?.assetId ||
      pbr.metallicRoughness?.path ||
      pbr.metallic?.assetId ||
      pbr.metallic?.path ||
      pbr.roughness?.assetId ||
      pbr.roughness?.path ||
      pbr.ao?.assetId ||
      pbr.ao?.path ||
      pbr.emissive?.assetId ||
      pbr.emissive?.path,
  )
}

function applyShadowFlags(root: THREE.Object3D, castShadows: boolean, lightCasts: boolean): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = castShadows && lightCasts
    obj.receiveShadow = lightCasts
    obj.frustumCulled = false
  })
}

function asStandard(mat: THREE.Material): THREE.MeshStandardMaterial {
  if (mat instanceof THREE.MeshStandardMaterial) return mat
  if (mat instanceof THREE.MeshPhysicalMaterial) return mat

  const std = new THREE.MeshStandardMaterial()
  if ('map' in mat && mat.map) std.map = mat.map as THREE.Texture
  if ('normalMap' in mat && mat.normalMap) std.normalMap = mat.normalMap as THREE.Texture
  if ('color' in mat && mat.color instanceof THREE.Color) std.color.copy(mat.color)
  if ('emissive' in mat && mat.emissive instanceof THREE.Color) std.emissive.copy(mat.emissive)
  if ('emissiveMap' in mat && mat.emissiveMap) std.emissiveMap = mat.emissiveMap as THREE.Texture
  if ('aoMap' in mat && mat.aoMap) std.aoMap = mat.aoMap as THREE.Texture
  if ('metalness' in mat && typeof mat.metalness === 'number') std.metalness = mat.metalness
  if ('roughness' in mat && typeof mat.roughness === 'number') std.roughness = mat.roughness
  if ('metalnessMap' in mat && mat.metalnessMap) std.metalnessMap = mat.metalnessMap as THREE.Texture
  if ('roughnessMap' in mat && mat.roughnessMap) std.roughnessMap = mat.roughnessMap as THREE.Texture
  if ('transparent' in mat) std.transparent = Boolean(mat.transparent)
  if ('opacity' in mat && typeof mat.opacity === 'number') std.opacity = mat.opacity
  if ('side' in mat && typeof mat.side === 'number') std.side = mat.side
  return std
}

async function applyPbr(
  root: THREE.Object3D,
  material: Extract<ModelMaterial, { mode: 'pbr' }>,
  assets: MediaAsset[],
  castShadows: boolean,
  lightCasts: boolean,
): Promise<void> {
  const pbr = material.pbr

  // Keep embedded FBX materials until the user assigns at least one override map.
  if (!hasAnyPbrMap(pbr)) {
    applyShadowFlags(root, castShadows, lightCasts)
    return
  }

  const [albedo, normal, mrPacked, metallic, roughness, ao, emissive] = await Promise.all([
    loadSlot(pbr.albedo, assets, true),
    loadSlot(pbr.normal, assets, false),
    loadSlot(pbr.metallicRoughness, assets, false),
    loadSlot(pbr.metallic, assets, false),
    loadSlot(pbr.roughness, assets, false),
    loadSlot(pbr.ao, assets, false),
    loadSlot(pbr.emissive, assets, true),
  ])

  let metalnessMap = metallic
  let roughnessMap = roughness
  if (mrPacked) {
    const packed = await remapMetallicRoughness(
      mrPacked,
      pbr.metallicRoughness?.metallicChannel ?? 'r',
      pbr.metallicRoughness?.roughnessChannel ?? 'g',
    )
    metalnessMap = packed
    roughnessMap = packed
  }

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = castShadows && lightCasts
    obj.receiveShadow = lightCasts
    obj.frustumCulled = false

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    const next = mats.map((m) => {
      const mat = asStandard(m)
      // Merge overrides onto existing (embedded) maps — leave unset slots alone.
      if (albedo) {
        mat.map = albedo
        mat.color.set(0xffffff)
      }
      if (normal) mat.normalMap = normal
      if (metalnessMap) {
        mat.metalnessMap = metalnessMap
        mat.metalness = 1
      }
      if (roughnessMap) {
        mat.roughnessMap = roughnessMap
        mat.roughness = 1
      }
      if (ao) mat.aoMap = ao
      if (emissive) {
        mat.emissiveMap = emissive
        if (mat.emissive.r === 0 && mat.emissive.g === 0 && mat.emissive.b === 0) {
          mat.emissive.set(0xffffff)
        }
      }
      mat.needsUpdate = true
      return mat
    })
    obj.material = Array.isArray(obj.material) ? next : next[0]!
  })
}

async function applyCustom(
  root: THREE.Object3D,
  material: Extract<ModelMaterial, { mode: 'custom' }>,
  assets: MediaAsset[],
  castShadows: boolean,
  lightCasts: boolean,
): Promise<void> {
  const uniforms: Record<string, THREE.IUniform> = {}
  const entries = Object.entries(material.textures ?? {})
  await Promise.all(
    entries.map(async ([name, assetIdOrPath]) => {
      const asset = assets.find((a) => a.id === assetIdOrPath)
      const path = asset?.path ?? (assetIdOrPath.includes('.') || assetIdOrPath.includes('\\') || assetIdOrPath.includes('/')
        ? assetIdOrPath
        : null)
      if (!path) return
      const tex = await loadTexture(path, true)
      uniforms[name] = { value: tex }
    }),
  )

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: material.vertexShader?.trim() || DEFAULT_VERTEX,
    fragmentShader: material.fragmentShader,
  })

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = castShadows && lightCasts
    obj.receiveShadow = lightCasts
    obj.material = mat
  })
}

export async function applyModelMaterial(
  root: THREE.Object3D,
  material: ModelMaterial,
  assets: MediaAsset[],
  castShadows: boolean,
  lightCasts: boolean,
): Promise<void> {
  if (material.mode === 'custom') {
    await applyCustom(root, material, assets, castShadows, lightCasts)
  } else {
    await applyPbr(root, material, assets, castShadows, lightCasts)
  }
}
