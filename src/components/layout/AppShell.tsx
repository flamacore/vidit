import { FolderOpen, Redo2, Save, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { MediaBin } from '../media/MediaBin'
import { PreviewPlayer } from '../preview/PreviewPlayer'
import { Inspector } from '../inspector/Inspector'
import { ExportModal } from '../inspector/ExportModal'
import { Timeline } from '../timeline/Timeline'
import { openProjectFile, saveCurrentProject } from '../../lib/projectFile'
import { useProjectStore } from '../../store/projectStore'

export function AppShell() {
  const name = useProjectStore((s) => s.name)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const setExportOpen = useProjectStore((s) => s.setExportOpen)
  const [ioError, setIoError] = useState('')

  const onSave = async () => {
    try {
      setIoError('')
      await saveCurrentProject()
    } catch (err) {
      setIoError(err instanceof Error ? err.message : String(err))
      window.setTimeout(() => setIoError(''), 4000)
    }
  }

  const onOpen = async () => {
    try {
      setIoError('')
      await openProjectFile()
    } catch (err) {
      setIoError(err instanceof Error ? err.message : String(err))
      window.setTimeout(() => setIoError(''), 4000)
    }
  }

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="titlebar">
        <div className="titlebar-brand">
          <span className="mark" />
          <span>VIDIT</span>
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>· {name}</span>
        </div>
        <div className="titlebar-actions">
          <button type="button" className="btn btn-icon" title="Open project (Ctrl+O)" onClick={onOpen}>
            <FolderOpen size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            title="Save project (Ctrl+S)"
            data-testid="save-project"
            onClick={onSave}
          >
            <Save size={15} />
          </button>
          <button type="button" className="btn btn-icon" title="Undo" data-testid="undo" onClick={undo}>
            <Undo2 size={15} />
          </button>
          <button type="button" className="btn btn-icon" title="Redo" data-testid="redo" onClick={redo}>
            <Redo2 size={15} />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="export-open"
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
        </div>
      </header>
      {ioError ? <div className="app-toast">{ioError}</div> : null}
      <div className="workspace">
        <MediaBin />
        <PreviewPlayer />
        <Inspector />
      </div>
      <Timeline />
      <ExportModal />
    </div>
  )
}
