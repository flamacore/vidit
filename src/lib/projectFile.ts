import { getBlendMode } from '../../shared/blendModes'
import { PROJECT_VERSION } from '../../shared/savedProject'
import { ensureAssetProxies } from './importMedia'
import { DEFAULT_TRANSFORM } from './elementTransform'
import { DEFAULT_CAMERA, DEFAULT_LIGHT, withModelDefaults } from './model3d'
import { DEFAULT_TEXT_STYLE } from './textStyle'
import { useProjectStore } from '../store/projectStore'
import type { MediaAsset, Track } from '../types/project'

export async function saveCurrentProject(): Promise<boolean> {
  if (!window.vidit) throw new Error('Desktop bridge missing')
  const payload = useProjectStore.getState().getSavePayload()
  const suggested = `${payload.name.replace(/[^\w\- ]+/g, '').trim() || 'Untitled'}.vidit`
  const path = await window.vidit.showSaveProjectDialog(suggested)
  if (!path) return false
  await window.vidit.saveProject(path, { version: PROJECT_VERSION, ...payload })
  const base = path.split(/[/\\]/).pop()?.replace(/\.vidit$/i, '').replace(/\.json$/i, '')
  if (base) useProjectStore.setState({ name: base })
  return true
}

export async function openProjectFile(): Promise<boolean> {
  if (!window.vidit) throw new Error('Desktop bridge missing')
  const path = await window.vidit.showOpenProjectDialog()
  if (!path) return false
  const data = await window.vidit.loadProject(path)

  // Rehydrate media proxies (thumbs / waveforms) from disk paths
  const enriched: MediaAsset[] = []
  for (const asset of data.assets) {
    try {
      if (asset.kind === 'model') {
        enriched.push({
          ...asset,
          kind: 'model',
          thumbnail: '',
          waveform: [],
          proxyStatus: undefined,
        })
        continue
      }
      const [thumb, wave] = await Promise.all([
        window.vidit.generateThumbnail(asset.path),
        asset.hasAudio
          ? window.vidit.generateWaveform(asset.path)
          : Promise.resolve({ path: asset.path, peaks: [] as number[] }),
      ])
      enriched.push({
        ...asset,
        proxyPath: asset.proxyPath,
        proxyStatus: asset.proxyPath
          ? 'ready'
          : asset.hasVideo && asset.kind !== 'image'
            ? 'pending'
            : undefined,
        thumbnail: thumb.dataUrl,
        waveform: wave.peaks,
      })
    } catch {
      enriched.push({
        ...asset,
        thumbnail: '',
        waveform: [],
        proxyStatus:
          asset.kind !== 'model' && asset.hasVideo && asset.kind !== 'image'
            ? 'pending'
            : undefined,
      })
    }
  }

  useProjectStore.getState().loadProjectState({
    name: data.name,
    settings: {
      width: data.settings.width,
      height: data.settings.height,
      fps: data.settings.fps,
      threeDEnabled: Boolean(data.settings.threeDEnabled),
    },
    sequenceSized: data.sequenceSized,
    assets: enriched,
    tracks: data.tracks.map(
      (t): Track => ({
        ...t,
        kind: t.kind,
        blendMode: getBlendMode(t.blendMode).id,
        height: Math.max(
          t.height ?? 40,
          t.kind === 'video' || t.kind === 'model' ? 72 : t.kind === 'text' ? 58 : 40,
        ),
      }),
    ),
    clips: data.clips.map((c) => ({ ...DEFAULT_TRANSFORM, ...c })),
    textClips: data.textClips.map((t) => ({
      ...DEFAULT_TEXT_STYLE,
      ...t,
      x: t.x ?? 0.5,
      y: t.y ?? 0.5,
    })),
    modelClips: (data.modelClips ?? []).map((m) =>
      withModelDefaults({
        ...m,
        id: m.id,
        trackId: m.trackId,
        assetId: m.assetId,
        start: m.start,
        duration: m.duration,
        material: m.material as ReturnType<typeof withModelDefaults>['material'],
      }),
    ),
    camera: { ...DEFAULT_CAMERA, ...data.camera },
    light: { ...DEFAULT_LIGHT, ...data.light },
    playhead: data.playhead ?? 0,
    zoom: data.zoom ?? 1,
    previewScale: data.previewScale ?? 100,
  })

  ensureAssetProxies(enriched)
  return true
}
