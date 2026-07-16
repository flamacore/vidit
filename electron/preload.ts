import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { Buffer } from 'node:buffer'
import type { ExportPlan, ExportProgress, ProbeResult, ThumbnailResult, WaveformResult } from './types'
import type { SavedProject } from '../shared/savedProject'

function toMediaUrl(filePath: string): string {
  const b64 = Buffer.from(filePath, 'utf8').toString('base64url')
  return `vidit-media://local/${b64}`
}

const api = {
  selectMediaFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openMedia'),
  showSaveDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveExport', defaultName),
  showSaveProjectDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveProject', defaultName),
  showOpenProjectDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openProject'),
  saveProject: (filePath: string, project: SavedProject): Promise<void> =>
    ipcRenderer.invoke('project:save', filePath, project),
  loadProject: (filePath: string): Promise<SavedProject> =>
    ipcRenderer.invoke('project:load', filePath),
  probe: (filePath: string): Promise<ProbeResult> => ipcRenderer.invoke('media:probe', filePath),
  generateThumbnail: (filePath: string): Promise<ThumbnailResult> =>
    ipcRenderer.invoke('media:thumbnail', filePath),
  generateWaveform: (filePath: string): Promise<WaveformResult> =>
    ipcRenderer.invoke('media:waveform', filePath),
  ensurePreviewProxy: (filePath: string): Promise<{ path: string }> =>
    ipcRenderer.invoke('media:previewProxy', filePath),
  toMediaUrl,
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return (file as File & { path?: string }).path ?? ''
    }
  },
  exportProject: (plan: ExportPlan): Promise<void> => ipcRenderer.invoke('export:run', plan),
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, p: ExportProgress) => cb(p)
    ipcRenderer.on('export:progress', handler)
    return () => ipcRenderer.removeListener('export:progress', handler)
  },
  platform: process.platform as NodeJS.Platform,
}

contextBridge.exposeInMainWorld('vidit', api)

export type ViditApi = typeof api
