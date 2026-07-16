export const PROJECT_VERSION = 1

export interface SavedProject {
  version: number
  name: string
  settings: { width: number; height: number; fps: number }
  sequenceSized: boolean
  assets: Array<{
    id: string
    path: string
    proxyPath?: string
    name: string
    kind: 'video' | 'audio' | 'image'
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
    kind: 'video' | 'audio' | 'text'
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
  playhead: number
  zoom: number
  previewScale: number
}
