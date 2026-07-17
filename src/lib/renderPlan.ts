import type {
  ExportCodec,
  ExportContainer,
  ExportPlan,
  ExportRateControl,
} from '../../electron/types'
import type {
  MediaAsset,
  ModelClip,
  ProjectSettings,
  TextClip,
  TimelineClip,
  Track,
} from '../types/project'
import { withTransform } from './elementTransform'
import { withTextDefaults } from './textStyle'
import { projectDuration } from './timelineMath'

export function buildExportPlan(opts: {
  settings: ProjectSettings
  assets: MediaAsset[]
  tracks: Track[]
  clips: TimelineClip[]
  textClips: TextClip[]
  /** Pre-baked model plates (path + clip metadata) */
  bakedModels?: Array<{ clip: ModelClip; path: string }>
  /** Pre-baked mid-stack text plates */
  bakedTexts?: Array<{ clip: TextClip; path: string }>
  /** Text clips still drawn via drawtext (on top) */
  drawTexts?: TextClip[]
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
    bakedModels = [],
    bakedTexts = [],
    drawTexts,
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
  const duration = projectDuration(clips, textClips, bakedModels.map((b) => b.clip))

  const mediaClips = [...clips].map((c) => {
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
      hasVideo: asset.hasVideo || asset.kind === 'image',
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
      blendMode: tracks.find((tr) => tr.id === c.trackId)?.blendMode ?? 'normal',
    }
  })

  const modelPlates = bakedModels.map(({ clip, path }) => {
    const tr = withTransform(clip)
    return {
      id: clip.id,
      path,
      trackIndex: trackOrder.indexOf(clip.trackId),
      start: clip.start,
      duration: clip.duration,
      inPoint: 0,
      outPoint: clip.duration,
      speed: 1,
      reverse: false,
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
      transitionIn: 0,
      hasVideo: true,
      hasAudio: false,
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
      blendMode: tracks.find((tr) => tr.id === clip.trackId)?.blendMode ?? 'normal',
    }
  })

  const textPlates = bakedTexts.map(({ clip, path }) => {
    return {
      id: clip.id,
      path,
      trackIndex: trackOrder.indexOf(clip.trackId),
      start: clip.start,
      duration: clip.duration,
      inPoint: 0,
      outPoint: clip.duration,
      speed: 1,
      reverse: false,
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
      transitionIn: 0,
      hasVideo: true,
      hasAudio: false,
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      cropL: 0,
      cropR: 0,
      cropT: 0,
      cropB: 0,
      blendMode: tracks.find((tr) => tr.id === clip.trackId)?.blendMode ?? 'normal',
    }
  })

  const sortedClips = [...mediaClips, ...modelPlates, ...textPlates].sort((a, b) => {
    if (a.trackIndex !== b.trackIndex) return b.trackIndex - a.trackIndex
    return a.start - b.start
  })

  const textsForDraw = drawTexts ?? textClips

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
    clips: sortedClips,
    texts: textsForDraw.map((raw) => {
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
        blendMode: tracks.find((tr) => tr.id === t.trackId)?.blendMode ?? 'normal',
      }
    }),
  }
}
