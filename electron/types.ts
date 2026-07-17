export type MediaKind = 'video' | 'audio' | 'image' | 'model'

export interface ProbeResult {
  path: string
  kind: MediaKind
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  hasVideo: boolean
  codec: string
}

export interface ThumbnailResult {
  path: string
  dataUrl: string
}

export interface WaveformResult {
  path: string
  peaks: number[]
}

export type ExportContainer = 'mp4' | 'mov'
export type ExportCodec = 'h264' | 'h265' | 'prores'
/** CRF = quality target (variable size); bitrate = target Mbps (predictable size) */
export type ExportRateControl = 'crf' | 'bitrate'

export interface ExportClipPlan {
  id: string
  path: string
  trackIndex: number
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
  hasVideo: boolean
  hasAudio: boolean
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
  /** Track blend mode id (Photoshop-style) */
  blendMode?: string
}

export interface ExportTextPlan {
  id: string
  text: string
  start: number
  duration: number
  fontFamily: string
  fontSize: number
  color: string
  opacity: number
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  x: number
  y: number
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
  blendMode?: string
}

export interface ExportPlan {
  width: number
  height: number
  fps: number
  duration: number
  container: ExportContainer
  codec: ExportCodec
  outputPath: string
  /** Ignored for ProRes (profile-based). Defaults to CRF. */
  rateControl?: ExportRateControl
  /** 0–51; lower = larger/better. Used when rateControl is `crf`. */
  crf?: number
  /** Video bitrate in kbps. Used when rateControl is `bitrate`. */
  videoBitrateKbps?: number
  /** Audio bitrate in kbps (AAC). Default 192. */
  audioBitrateKbps?: number
  clips: ExportClipPlan[]
  texts: ExportTextPlan[]
}

export interface ExportProgress {
  percent: number
  time: number
  message: string
  /** Optional JPEG frame from the encode graph (data URL) */
  previewDataUrl?: string
}
