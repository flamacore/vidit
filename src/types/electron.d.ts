import type {
  ExportPlan,
  ExportProgress,
  ProbeResult,
  ThumbnailResult,
  WaveformResult,
} from '../../electron/types'
import type { SavedProject } from '../../shared/savedProject'

interface ViditApi {
  selectMediaFiles: () => Promise<string[]>
  showSaveDialog: (defaultName: string) => Promise<string | null>
  showSaveProjectDialog: (defaultName: string) => Promise<string | null>
  showOpenProjectDialog: () => Promise<string | null>
  saveProject: (filePath: string, project: SavedProject) => Promise<void>
  loadProject: (filePath: string) => Promise<SavedProject>
  probe: (filePath: string) => Promise<ProbeResult>
  generateThumbnail: (filePath: string) => Promise<ThumbnailResult>
  generateWaveform: (filePath: string) => Promise<WaveformResult>
  ensurePreviewProxy: (filePath: string) => Promise<{ path: string }>
  toMediaUrl: (filePath: string) => string
  getPathForFile: (file: File) => string
  exportProject: (plan: ExportPlan) => Promise<void>
  onExportProgress: (cb: (p: ExportProgress) => void) => () => void
  platform: string
}

declare global {
  interface Window {
    vidit: ViditApi
  }
}

export {}
