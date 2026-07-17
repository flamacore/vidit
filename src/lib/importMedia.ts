import { v4 as uuid } from 'uuid'
import { forgetPreviewBlobUrl } from './previewBlobCache'
import { useProjectStore } from '../store/projectStore'
import type { MediaAsset } from '../types/project'

export function assertDesktopApi(): void {
  if (!window.vidit) {
    throw new Error(
      'Desktop bridge missing (window.vidit). Restart the Electron app — the preload script did not load.',
    )
  }
}

const proxyJobs = new Set<string>()

async function buildPreviewProxy(assetId: string, filePath: string): Promise<void> {
  if (proxyJobs.has(assetId)) return
  proxyJobs.add(assetId)
  const prev = useProjectStore.getState().assets.find((a) => a.id === assetId)?.proxyPath
  if (!prev) {
    useProjectStore.getState().patchAsset(assetId, { proxyStatus: 'pending' })
  }
  try {
    const { path: proxyPath } = await window.vidit!.ensurePreviewProxy(filePath)
    const cur = useProjectStore.getState().assets.find((a) => a.id === assetId)
    if (cur?.proxyPath === proxyPath && cur.proxyStatus === 'ready') return
    if (cur?.proxyPath && cur.proxyPath !== proxyPath) {
      forgetPreviewBlobUrl(cur.proxyPath)
    }
    useProjectStore.getState().patchAsset(assetId, {
      proxyPath,
      proxyStatus: 'ready',
    })
  } catch (err) {
    console.error('Preview proxy failed', filePath, err)
    useProjectStore.getState().patchAsset(assetId, { proxyStatus: 'error' })
  } finally {
    proxyJobs.delete(assetId)
  }
}

/** Ensure Chromium-playable proxies exist (also upgrades stale long-GOP proxies). */
export function ensureAssetProxies(assets: MediaAsset[]): void {
  if (!window.vidit?.ensurePreviewProxy) return
  for (const asset of assets) {
    if (!asset.hasVideo || asset.kind === 'image' || asset.kind === 'model') continue
    if (asset.proxyStatus === 'error') continue
    void buildPreviewProxy(asset.id, asset.path)
  }
}

export async function importPaths(paths: string[]): Promise<{ imported: number; errors: string[] }> {
  assertDesktopApi()
  if (paths.length === 0) return { imported: 0, errors: [] }

  const assets: MediaAsset[] = []
  const errors: string[] = []

  for (const filePath of paths) {
    try {
      const probe = await window.vidit.probe(filePath)
      const name = filePath.split(/[/\\]/).pop() ?? 'media'
      if (probe.kind === 'model') {
        assets.push({
          id: uuid(),
          path: filePath,
          name,
          kind: 'model',
          duration: probe.duration || 5,
          width: 0,
          height: 0,
          fps: probe.fps || 30,
          hasAudio: false,
          hasVideo: false,
          codec: probe.codec || 'fbx',
          thumbnail: '',
          waveform: [],
        })
        continue
      }
      const [thumb, wave] = await Promise.all([
        window.vidit.generateThumbnail(filePath),
        probe.hasAudio
          ? window.vidit.generateWaveform(filePath)
          : Promise.resolve({ path: filePath, peaks: [] as number[] }),
      ])
      const needsProxy = probe.hasVideo && probe.kind !== 'image'
      assets.push({
        id: uuid(),
        path: filePath,
        proxyStatus: needsProxy ? 'pending' : undefined,
        name,
        kind: probe.kind,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
        hasVideo: probe.hasVideo,
        codec: probe.codec,
        thumbnail: thumb.dataUrl,
        waveform: wave.peaks,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to import', filePath, err)
      errors.push(`${filePath}: ${message}`)
    }
  }

  if (assets.length) {
    useProjectStore.getState().addAssets(assets)
    ensureAssetProxies(assets)
  }
  return { imported: assets.length, errors }
}

/** Test / console helper */
declare global {
  interface Window {
    __viditImportPaths?: typeof importPaths
  }
}

if (typeof window !== 'undefined') {
  window.__viditImportPaths = importPaths
}
