import type {
  ExportCodec,
  ExportContainer,
  ExportPlan,
  ExportRateControl,
} from '../../electron/types'
import type { MediaAsset, ProjectSettings, TextClip, TimelineClip, Track } from '../types/project'
import { withTransform } from './elementTransform'
import { withTextDefaults } from './textStyle'
import { projectDuration } from './timelineMath'

export function buildExportPlan(opts: {
  settings: ProjectSettings
  assets: MediaAsset[]
  tracks: Track[]
  clips: TimelineClip[]
  textClips: TextClip[]
  container: ExportContainer
  codec: ExportCodec
  outputPath: string
  rateControl?: ExportRateControl
  crf?: number
  videoBitrateKbps?: number
  audioBitrateKbps?: number
}): ExportPlan {
  const {
    settings,
    assets,
    tracks,
    clips,
    textClips,
    container,
    codec,
    outputPath,
    rateControl = 'crf',
    crf,
    videoBitrateKbps,
    audioBitrateKbps = 192,
  } = opts
  const assetMap = new Map(assets.map((a) => [a.id, a]))
  const trackOrder = tracks.map((t) => t.id)
  const duration = projectDuration(clips, textClips)

  const sortedClips = [...clips].sort((a, b) => {
    const ta = trackOrder.indexOf(a.trackId)
    const tb = trackOrder.indexOf(b.trackId)
    if (ta !== tb) return tb - ta // lower tracks first for overlay
    return a.start - b.start
  })

  return {
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    duration,
    container: codec === 'prores' ? 'mov' : container,
    codec,
    outputPath,
    rateControl: codec === 'prores' ? 'crf' : rateControl,
    crf,
    videoBitrateKbps,
    audioBitrateKbps,
    clips: sortedClips.map((c) => {
      const asset = assetMap.get(c.assetId)!
      const tr = withTransform(c)
      return {
        id: c.id,
        path: asset.path,
        trackIndex: trackOrder.indexOf(c.trackId),
        start: c.start,
        duration: c.duration,
        inPoint: c.inPoint,
        outPoint: c.outPoint,
        speed: c.speed,
        reverse: c.reverse,
        volume: tracks.find((t) => t.id === c.trackId)?.muted ? 0 : c.volume,
        fadeIn: c.fadeIn,
        fadeOut: c.fadeOut,
        transitionIn: c.transitionIn,
        hasVideo: asset.hasVideo,
        hasAudio: asset.hasAudio,
        x: tr.x,
        y: tr.y,
        scaleX: tr.scaleX,
        scaleY: tr.scaleY,
        rotation: tr.rotation,
        opacity: tr.opacity,
        cropL: tr.cropL,
        cropR: tr.cropR,
        cropT: tr.cropT,
        cropB: tr.cropB,
      }
    }),
    texts: textClips.map((raw) => {
      const t = withTextDefaults(raw)
      return {
        id: t.id,
        text: t.text,
        start: t.start,
        duration: t.duration,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        color: t.color,
        opacity: t.opacity,
        bold: t.bold,
        italic: t.italic,
        align: t.align,
        verticalAlign: t.verticalAlign,
        x: t.x,
        y: t.y,
        outlineEnabled: t.outlineEnabled,
        outlineColor: t.outlineColor,
        outlineWidth: t.outlineWidth,
        shadowEnabled: t.shadowEnabled,
        shadowColor: t.shadowColor,
        shadowOpacity: t.shadowOpacity,
        shadowBlur: t.shadowBlur,
        shadowOffsetX: t.shadowOffsetX,
        shadowOffsetY: t.shadowOffsetY,
        bevelEnabled: t.bevelEnabled,
        bevelDepth: t.bevelDepth,
      }
    }),
  }
}
