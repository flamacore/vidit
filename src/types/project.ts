export type TrackKind = 'video' | 'audio' | 'text'

export interface MediaAsset {
  id: string
  path: string
  /** Chromium-safe H.264 proxy used for realtime preview */
  proxyPath?: string
  proxyStatus?: 'pending' | 'ready' | 'error'
  name: string
  kind: 'video' | 'audio' | 'image'
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

export type Selection =
  | { type: 'clip'; id: string }
  | { type: 'text'; id: string }
  | { type: 'none' }

export interface ProjectSettings {
  width: number
  height: number
  fps: number
}

export interface ProjectState {
  name: string
  settings: ProjectSettings
  assets: MediaAsset[]
  tracks: Track[]
  clips: TimelineClip[]
  textClips: TextClip[]
  selection: Selection
  selectedClipIds: string[]
  selectedTextIds: string[]
  selectedMediaIds: string[]
  playhead: number
  zoom: number
  previewScale: number
  snapEnabled: boolean
  isPlaying: boolean
  tool: 'select' | 'razor'
  sequenceSized: boolean
}
