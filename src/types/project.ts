import type { BlendModeId } from '../../shared/blendModes'

export type { BlendModeId }
export type TrackKind = 'video' | 'audio' | 'text' | 'model'

export type TextureChannel = 'r' | 'g' | 'b' | 'a'

export interface TextureSlot {
  assetId?: string
  path?: string
  metallicChannel?: TextureChannel
  roughnessChannel?: TextureChannel
  aoChannel?: TextureChannel
}

export interface PbrMaps {
  albedo?: TextureSlot
  normal?: TextureSlot
  metallicRoughness?: TextureSlot
  metallic?: TextureSlot
  roughness?: TextureSlot
  ao?: TextureSlot
  emissive?: TextureSlot
}

export type ModelMaterial =
  | { mode: 'pbr'; pbr: PbrMaps }
  | {
      mode: 'custom'
      vertexShader?: string
      fragmentShader: string
      /** Uniform name → image asset id */
      textures: Record<string, string>
    }

export interface MediaAsset {
  id: string
  path: string
  /** Chromium-safe H.264 proxy used for realtime preview */
  proxyPath?: string
  proxyStatus?: 'pending' | 'ready' | 'error'
  name: string
  kind: 'video' | 'audio' | 'image' | 'model'
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  hasVideo: boolean
  codec?: string
  thumbnail: string
  waveform: number[]
}

export interface Track {
  id: string
  kind: TrackKind
  name: string
  muted: boolean
  locked: boolean
  height: number
  /** Photoshop-style blend with layers below (video/text/model tracks). */
  blendMode: BlendModeId
}

export interface TimelineClip {
  id: string
  assetId: string
  trackId: string
  start: number
  duration: number
  inPoint: number
  outPoint: number
  speed: number
  reverse: boolean
  volume: number
  fadeIn: number
  fadeOut: number
  transitionIn: number
  /** Center X in frame 0–1 */
  x: number
  /** Center Y in frame 0–1 */
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
  cropL: number
  cropR: number
  cropT: number
  cropB: number
}

export type TextAlign = 'left' | 'center' | 'right'
export type TextVAlign = 'top' | 'middle' | 'bottom'

export interface TextClip {
  id: string
  trackId: string
  start: number
  duration: number
  text: string
  fontFamily: string
  fontSize: number
  /** Fill color `#rrggbb` */
  color: string
  /** Fill opacity 0–1 */
  opacity: number
  bold: boolean
  italic: boolean
  align: TextAlign
  verticalAlign: TextVAlign
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  cropL: number
  cropR: number
  cropT: number
  cropB: number
  outlineEnabled: boolean
  outlineColor: string
  outlineWidth: number
  shadowEnabled: boolean
  shadowColor: string
  shadowOpacity: number
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  bevelEnabled: boolean
  bevelDepth: number
}

export interface ModelClip {
  id: string
  trackId: string
  assetId: string
  start: number
  duration: number
  /** Object transform in world space */
  posX: number
  posY: number
  posZ: number
  rotX: number
  rotY: number
  rotZ: number
  objScaleX: number
  objScaleY: number
  objScaleZ: number
  /** Plate transform in frame (2D compositor) */
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
  cropL: number
  cropR: number
  cropT: number
  cropB: number
  castShadows: boolean
  material: ModelMaterial
}

export interface ProjectCamera {
  /** Orbit look-at / target position */
  posX: number
  posY: number
  posZ: number
  yaw: number
  pitch: number
  distance: number
  fov: number
}

export interface ProjectLight {
  intensity: number
  color: string
  shadowOpacity: number
  yaw: number
  pitch: number
  castShadows: boolean
}

export type Selection =
  | { type: 'clip'; id: string }
  | { type: 'text'; id: string }
  | { type: 'model'; id: string }
  | { type: 'none' }

export interface ProjectSettings {
  width: number
  height: number
  fps: number
  threeDEnabled: boolean
}

export interface ProjectState {
  name: string
  settings: ProjectSettings
  assets: MediaAsset[]
  tracks: Track[]
  clips: TimelineClip[]
  textClips: TextClip[]
  modelClips: ModelClip[]
  camera: ProjectCamera
  light: ProjectLight
  selection: Selection
  selectedClipIds: string[]
  selectedTextIds: string[]
  selectedModelIds: string[]
  selectedMediaIds: string[]
  playhead: number
  zoom: number
  previewScale: number
  snapEnabled: boolean
  isPlaying: boolean
  tool: 'select' | 'razor'
  sequenceSized: boolean
}
