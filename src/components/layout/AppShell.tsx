import { FolderOpen, Redo2, Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MediaBin } from '../media/MediaBin'
import { PreviewPlayer } from '../preview/PreviewPlayer'
import { Inspector } from '../inspector/Inspector'
import { ExportModal } from '../inspector/ExportModal'
import { Timeline } from '../timeline/Timeline'
import { openProjectFile, saveCurrentProject } from '../../lib/projectFile'
import { clamp } from '../../lib/timelineMath'
import { useProjectStore } from '../../store/projectStore'

const TIMELINE_H_KEY = 'vidit-timeline-h'
const TIMELINE_H_MIN = 160
const WORKSPACE_MIN = 180

function readStoredTimelineH(): number {
  try {
    const n = Number(localStorage.getItem(TIMELINE_H_KEY))
    if (Number.isFinite(n)) return clamp(n, TIMELINE_H_MIN, 900)
  } catch {
    /* ignore */
  }
  return 280
}

export function AppShell() {
  const name = useProjectStore((s) => s.name)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const setExportOpen = useProjectStore((s) => s.setExportOpen)
  const [ioError, setIoError] = useState('')
  const [timelineH, setTimelineH] = useState(readStoredTimelineH)
  const shellRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const maxTimelineH = useCallback(() => {
    const shell = shellRef.current
    const h = shell?.clientHeight ?? window.innerHeight
    const titlebar = 40
    return Math.max(TIMELINE_H_MIN, h - titlebar - WORKSPACE_MIN)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(TIMELINE_H_KEY, String(timelineH))
    } catch {
      /* ignore */
    }
  }, [timelineH])

  useEffect(() => {
    const clampH = () => setTimelineH((h) => clamp(h, TIMELINE_H_MIN, maxTimelineH()))
    clampH()
    window.addEventListener('resize', clampH)
    return () => window.removeEventListener('resize', clampH)
  }, [maxTimelineH])

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: timelineH }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // Dragging up grows the timeline
    const next = drag.startH + (drag.startY - e.clientY)
    setTimelineH(clamp(Math.round(next), TIMELINE_H_MIN, maxTimelineH()))
  }

  const onResizePointerUp = () => {
    dragRef.current = null
  }

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
    <div
      ref={shellRef}
      className="app-shell"
      data-testid="app-shell"
      style={{ ['--timeline-h' as string]: `${timelineH}px` }}
    >
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
      <div
        className="timeline-resize-handle"
        data-testid="timeline-resize"
        title="Drag to resize timeline"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onDoubleClick={() => setTimelineH(280)}
      />
      <Timeline />
      <ExportModal />
    </div>
  )
}
