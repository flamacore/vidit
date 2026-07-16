import { ensureAssetProxies } from './importMedia'
import { DEFAULT_TRANSFORM } from './elementTransform'
import { DEFAULT_TEXT_STYLE } from './textStyle'
import { useProjectStore } from '../store/projectStore'
import type { MediaAsset } from '../types/project'

export async function saveCurrentProject(): Promise<boolean> {
  if (!window.vidit) throw new Error('Desktop bridge missing')
  const payload = useProjectStore.getState().getSavePayload()
  const suggested = `${payload.name.replace(/[^\w\- ]+/g, '').trim() || 'Untitled'}.vidit`
  const path = await window.vidit.showSaveProjectDialog(suggested)
  if (!path) return false
  await window.vidit.saveProject(path, { version: 1, ...payload })
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
      const [thumb, wave] = await Promise.all([
        window.vidit.generateThumbnail(asset.path),
        asset.hasAudio
          ? window.vidit.generateWaveform(asset.path)
          : Promise.resolve({ path: asset.path, peaks: [] as number[] }),
      ])
      enriched.push({
        ...asset,
        proxyPath: asset.proxyPath,
        proxyStatus: asset.proxyPath ? 'ready' : asset.hasVideo && asset.kind !== 'image' ? 'pending' : undefined,
        thumbnail: thumb.dataUrl,
        waveform: wave.peaks,
      })
    } catch {
      enriched.push({
        ...asset,
        thumbnail: '',
        waveform: [],
        proxyStatus: asset.hasVideo && asset.kind !== 'image' ? 'pending' : undefined,
      })
    }
  }

  useProjectStore.getState().loadProjectState({
    name: data.name,
    settings: data.settings,
    sequenceSized: data.sequenceSized,
    assets: enriched,
    tracks: data.tracks,
    clips: data.clips.map((c) => ({ ...DEFAULT_TRANSFORM, ...c })),
    textClips: data.textClips.map((t) => ({
      ...DEFAULT_TEXT_STYLE,
      ...t,
      x: t.x ?? 0.5,
      y: t.y ?? 0.5,
    })),
    playhead: data.playhead ?? 0,
    zoom: data.zoom ?? 1,
    previewScale: data.previewScale ?? 100,
  })

  ensureAssetProxies(enriched)
  return true
}
