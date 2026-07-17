import { Film, FolderOpen, Music, Image as ImageIcon, Trash2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { formatDuration } from '../../lib/timelineMath'
import { importPaths } from '../../lib/importMedia'
import { forgetPreviewBlobUrl } from '../../lib/previewBlobCache'
import { useProjectStore } from '../../store/projectStore'
import type { MediaAsset } from '../../types/project'
import clsx from 'clsx'

interface CtxMenu {
  x: number
  y: number
  assetIds: string[]
}

export function MediaBin() {
  const assets = useProjectStore((s) => s.assets)
  const selectedMediaIds = useProjectStore((s) => s.selectedMediaIds)
  const toggleMediaSelect = useProjectStore((s) => s.toggleMediaSelect)
  const setMediaSelection = useProjectStore((s) => s.setMediaSelection)
  const removeAssets = useProjectStore((s) => s.removeAssets)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bridgeReady, setBridgeReady] = useState(() => Boolean(window.vidit))
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBridgeReady(Boolean(window.vidit))
    const id = window.setInterval(() => setBridgeReady(Boolean(window.vidit)), 500)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(''), 4000)
    return () => window.clearTimeout(t)
  }, [error])

  useEffect(() => {
    if (!ctx) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current?.contains(e.target as Node)) return
      setCtx(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtx(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  const runImport = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    setBusy(true)
    setError('')
    try {
      const result = await importPaths(paths)
      if (result.imported === 0 && result.errors.length) {
        setError(result.errors[0] ?? 'Import failed')
      } else if (result.errors.length) {
        setError(`Imported ${result.imported}, ${result.errors.length} failed`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const onImport = useCallback(async () => {
    if (!window.vidit) {
      setError('Desktop bridge missing. Restart the Electron app.')
      return
    }
    try {
      const paths = await window.vidit.selectMediaFiles()
      await runImport(paths)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [runImport])

  const deleteIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      const state = useProjectStore.getState()
      for (const id of ids) {
        const asset = state.assets.find((a) => a.id === id)
        if (asset?.proxyPath) forgetPreviewBlobUrl(asset.proxyPath)
        if (asset?.path) forgetPreviewBlobUrl(asset.path)
      }
      removeAssets(ids)
      setCtx(null)
    },
    [removeAssets],
  )

  const onCardClick = (e: ReactMouseEvent, asset: MediaAsset) => {
    if (e.shiftKey) toggleMediaSelect(asset.id, 'range')
    else if (e.metaKey || e.ctrlKey) toggleMediaSelect(asset.id, 'toggle')
    else toggleMediaSelect(asset.id, 'replace')
  }

  const onCardContextMenu = (e: ReactMouseEvent, asset: MediaAsset) => {
    e.preventDefault()
    e.stopPropagation()
    const ids = selectedMediaIds.includes(asset.id) ? [...selectedMediaIds] : [asset.id]
    if (!selectedMediaIds.includes(asset.id)) setMediaSelection(ids)
    setCtx({ x: e.clientX, y: e.clientY, assetIds: ids })
  }

  const onDragStart = (e: DragEvent, asset: MediaAsset) => {
    let ids = selectedMediaIds.includes(asset.id) ? [...selectedMediaIds] : [asset.id]
    const order = new Map(assets.map((a, i) => [a.id, i]))
    ids = ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    if (!selectedMediaIds.includes(asset.id)) setMediaSelection(ids)
    e.dataTransfer.setData('application/vidit-assets', JSON.stringify(ids))
    e.dataTransfer.setData('application/vidit-asset', ids[0] ?? asset.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onDropFiles = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (!window.vidit) {
      setError('Desktop bridge missing. Restart the Electron app.')
      return
    }
    const paths = [...e.dataTransfer.files]
      .map((f) => window.vidit.getPathForFile(f))
      .filter(Boolean)
    if (paths.length === 0) {
      setError('Could not read dropped file paths. Try Import instead.')
      return
    }
    await runImport(paths)
  }

  const canDelete = selectedMediaIds.length > 0

  return (
    <aside
      className={clsx('panel', dragging && 'drop-overlay')}
      data-testid="media-bin"
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragging(false)
      }}
      onDrop={onDropFiles}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('panel-body')) {
          setMediaSelection([])
        }
      }}
    >
      <div className="panel-header">
        <span>Media{selectedMediaIds.length > 1 ? ` · ${selectedMediaIds.length}` : ''}</span>
        <div className="panel-header-actions">
          {canDelete ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              title="Delete selected media"
              data-testid="delete-media"
              onClick={() => deleteIds(selectedMediaIds)}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            title="Import"
            data-testid="import-icon"
            disabled={busy || !bridgeReady}
            onClick={onImport}
          >
            <FolderOpen size={15} />
          </button>
        </div>
      </div>
      <div className="panel-body" data-testid="media-bin-body">
        {!bridgeReady ? (
          <div className="empty-hint" style={{ color: 'var(--danger)' }} data-testid="bridge-missing">
            Desktop bridge not connected. Close the browser tab and run{' '}
            <code>npm run dev</code> so Electron loads the preload script.
          </div>
        ) : null}
        {error ? (
          <div
            className="empty-hint"
            style={{ color: 'var(--danger)', paddingBottom: 8 }}
            data-testid="import-error"
          >
            {error}
          </div>
        ) : null}
        {assets.length === 0 ? (
          <div className="empty-hint">
            {busy ? 'Importing…' : 'Drop videos here or click Import media.'}
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                data-testid="import-media"
                disabled={busy || !bridgeReady}
                onClick={onImport}
              >
                <FolderOpen size={14} /> Import media
              </button>
            </div>
          </div>
        ) : (
          <div className="media-grid" data-testid="media-grid">
            {assets.map((asset) => {
              const selected = selectedMediaIds.includes(asset.id)
              return (
                <div
                  key={asset.id}
                  className={clsx('media-card', selected && 'selected')}
                  draggable
                  data-testid="media-card"
                  data-asset-id={asset.id}
                  onClick={(e) => onCardClick(e, asset)}
                  onContextMenu={(e) => onCardContextMenu(e, asset)}
                  onDragStart={(e) => onDragStart(e, asset)}
                  title={`${asset.name} — right-click to delete · Ctrl/⌘ multi-select`}
                >
                  <div
                    className="media-thumb"
                    style={
                      asset.thumbnail
                        ? { backgroundImage: `url(${asset.thumbnail})` }
                        : undefined
                    }
                  >
                    {!asset.thumbnail &&
                      (asset.kind === 'audio' ? (
                        <Music size={20} />
                      ) : asset.kind === 'image' ? (
                        <ImageIcon size={20} />
                      ) : (
                        <Film size={20} />
                      ))}
                  </div>
                  <div className="media-meta">
                    <div className="media-name">{asset.name}</div>
                    <div className="media-dur">{formatDuration(asset.duration)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {ctx ? (
        <div
          ref={ctxRef}
          className="context-menu"
          data-testid="media-context-menu"
          style={{ left: ctx.x, top: ctx.y }}
          role="menu"
        >
          <button
            type="button"
            className="context-menu-item danger"
            role="menuitem"
            onClick={() => deleteIds(ctx.assetIds)}
          >
            <Trash2 size={14} />
            Delete{ctx.assetIds.length > 1 ? ` (${ctx.assetIds.length})` : ''}
          </button>
        </div>
      ) : null}
    </aside>
  )
}
