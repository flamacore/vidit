import { useEffect } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { importPaths } from '../lib/importMedia'
import { openProjectFile, saveCurrentProject } from '../lib/projectFile'
import { matchShortcut } from '../lib/shortcuts'
import { getSequenceDuration, useProjectStore } from '../store/projectStore'
import '../styles/tokens.css'
import '../styles/editor.css'

declare global {
  interface Window {
    __viditStore?: typeof useProjectStore
  }
}

export function EditorApp() {
  useEffect(() => {
    window.__viditStore = useProjectStore
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key !== 'Escape') return
      }
      const action = matchShortcut(e)
      if (!action) return
      e.preventDefault()
      const s = useProjectStore.getState()
      switch (action) {
        case 'playPause':
          s.setPlaying(!s.isPlaying)
          break
        case 'undo':
          s.undo()
          break
        case 'redo':
          s.redo()
          break
        case 'delete': {
          const hasTimeline =
            s.selectedClipIds.length > 0 ||
            s.selectedTextIds.length > 0 ||
            s.selectedModelIds.length > 0 ||
            s.selection.type !== 'none'
          if (hasTimeline) s.deleteSelection()
          else if (s.selectedMediaIds.length > 0) s.removeAssets()
          break
        }
        case 'copy':
          void s.copySelection()
          break
        case 'paste':
          void s.pasteClipboard()
          break
        case 'cut':
          void s.cutSelection()
          break
        case 'split':
          s.splitAtPlayhead()
          break
        case 'zoomIn':
          s.setZoom(s.zoom * 1.25)
          break
        case 'zoomOut':
          s.setZoom(s.zoom / 1.25)
          break
        case 'zoomFit':
          s.setZoom(1)
          break
        case 'snap':
          s.toggleSnap()
          break
        case 'selectTool':
          s.setTool('select')
          break
        case 'razorTool':
          s.setTool('razor')
          break
        case 'frameBack':
          s.setPlayhead(Math.max(0, s.playhead - 1 / s.settings.fps))
          break
        case 'frameForward':
          s.setPlayhead(s.playhead + 1 / s.settings.fps)
          break
        case 'import':
          void window.vidit?.selectMediaFiles().then((paths) => importPaths(paths))
          break
        case 'goStart':
          s.setPlaying(false)
          s.setPlayhead(0)
          break
        case 'goEnd':
          s.setPlaying(false)
          s.setPlayhead(getSequenceDuration())
          break
        case 'save':
          void saveCurrentProject().catch(console.error)
          break
        case 'open':
          void openProjectFile().catch(console.error)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return <AppShell />
}
