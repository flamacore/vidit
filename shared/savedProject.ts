export const PROJECT_VERSION = 2

export interface SavedProject {
  version: number
  name: string
  settings: {
    width: number
    height: number
    fps: number
    threeDEnabled?: boolean
  }
  sequenceSized: boolean
  assets: Array<{
    id: string
    path: string
    proxyPath?: string
    name: string
    kind: 'video' | 'audio' | 'image' | 'model'
    duration: number
    width: number
    height: number
    fps: number
    hasAudio: boolean
    hasVideo: boolean
    codec?: string
  }>
  tracks: Array<{
    id: string
    kind: 'video' | 'audio' | 'text' | 'model'
    name: string
    muted: boolean
    locked: boolean
    height: number
    blendMode?: string
  }>
  clips: Array<{
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
    x?: number
    y?: number
    scaleX?: number
    scaleY?: number
    rotation?: number
    opacity?: number
    cropL?: number
    cropR?: number
    cropT?: number
    cropB?: number
  }>
  textClips: Array<{
    id: string
    trackId: string
    start: number
    duration: number
    text: string
    fontFamily: string
    fontSize: number
    color: string
    opacity?: number
    bold: boolean
    italic: boolean
    align: 'left' | 'center' | 'right'
    verticalAlign: 'top' | 'middle' | 'bottom'
    x: number
    y: number
    scaleX?: number
    scaleY?: number
    rotation?: number
    cropL?: number
    cropR?: number
    cropT?: number
    cropB?: number
    outlineEnabled?: boolean
    outlineColor?: string
    outlineWidth?: number
    shadowEnabled?: boolean
    shadowColor?: string
    shadowOpacity?: number
    shadowBlur?: number
    shadowOffsetX?: number
    shadowOffsetY?: number
    bevelEnabled?: boolean
    bevelDepth?: number
  }>
  modelClips?: Array<{
    id: string
    trackId: string
    assetId: string
    start: number
    duration: number
    posX?: number
    posY?: number
    posZ?: number
    rotX?: number
    rotY?: number
    rotZ?: number
    objScaleX?: number
    objScaleY?: number
    objScaleZ?: number
    x?: number
    y?: number
    scaleX?: number
    scaleY?: number
    rotation?: number
    opacity?: number
    cropL?: number
    cropR?: number
    cropT?: number
    cropB?: number
    castShadows?: boolean
    material?: unknown
  }>
  camera?: {
    posX?: number
    posY?: number
    posZ?: number
    yaw: number
    pitch: number
    distance: number
    fov: number
  }
  light?: {
    intensity: number
    color: string
    shadowOpacity: number
    yaw: number
    pitch: number
    castShadows: boolean
  }
  playhead: number
  zoom: number
  previewScale: number
}
