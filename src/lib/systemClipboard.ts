import type { MediaAsset, TextClip, TimelineClip } from '../types/project'

const PREFIX = 'VIDIT_LAYERS_V1:'
const STORAGE_KEY = 'vidit.layerClipboard'

export interface ViditClipboardPayload {
  version: 1
  clips: TimelineClip[]
  texts: TextClip[]
  /** Asset snapshots needed to rehydrate in another project */
  assets: Array<Omit<MediaAsset, 'thumbnail' | 'waveform' | 'proxyPath' | 'proxyStatus'>>
}

export async function writeSystemClipboardLayers(payload: ViditClipboardPayload): Promise<void> {
  const json = JSON.stringify(payload)
  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch {
    /* ignore quota */
  }
  try {
    await navigator.clipboard.writeText(PREFIX + json)
  } catch {
    /* permissions / insecure context */
  }
}

export async function readSystemClipboardLayers(): Promise<ViditClipboardPayload | null> {
  try {
    const text = await navigator.clipboard.readText()
    if (text.startsWith(PREFIX)) {
      return JSON.parse(text.slice(PREFIX.length)) as ViditClipboardPayload
    }
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ViditClipboardPayload
  } catch {
    /* ignore */
  }
  return null
}
