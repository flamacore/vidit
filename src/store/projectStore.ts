import { current, enableMapSet, produce } from 'immer'
import { v4 as uuid } from 'uuid'
import { create } from 'zustand'
import { snapTime, collectSnapTargets } from '../lib/snap'
import {
  closestCutOnTrack,
  findCoveringClip,
  rippleForward,
  splitClipAtTime,
} from '../lib/timelineEdit'
import { DEFAULT_TRANSFORM } from '../lib/elementTransform'
import { DEFAULT_TEXT_STYLE } from '../lib/textStyle'
import { clamp, projectDuration, pxToTime } from '../lib/timelineMath'
import {
  readSystemClipboardLayers,
  writeSystemClipboardLayers,
  type ViditClipboardPayload,
} from '../lib/systemClipboard'
import {
  DEFAULT_BLEND_MODE,
  getBlendMode,
  type BlendModeId,
} from '../../shared/blendModes'
import type {
  MediaAsset,
  ProjectSettings,
  ProjectState,
  Selection,
  TextAlign,
  TextClip,
  TextVAlign,
  TimelineClip,
  Track,
} from '../types/project'

enableMapSet()

const MAX_HISTORY = 80

/** Deep-clone plain project data; safe with Immer drafts */
function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

type EditableSlice = Pick<
  ProjectState,
  'assets' | 'tracks' | 'clips' | 'textClips' | 'settings' | 'name' | 'sequenceSized'
>

interface HistoryState {
  past: EditableSlice[]
  future: EditableSlice[]
}

type Clipboard = ViditClipboardPayload

interface ProjectStore extends ProjectState {
  history: HistoryState
  clipboard: Clipboard | null
  exportOpen: boolean
  gestureActive: boolean
  setExportOpen: (open: boolean) => void
  setPlayhead: (t: number) => void
  setPlaying: (v: boolean) => void
  setZoom: (z: number) => void
  setPreviewScale: (pct: number) => void
  toggleSnap: () => void
  setTool: (t: 'select' | 'razor') => void
  select: (sel: Selection) => void
  selectTimelineClip: (id: string, mode: 'replace' | 'toggle' | 'range') => void
  selectTimelineText: (id: string, mode: 'replace' | 'toggle' | 'range') => void
  clearTimelineSelection: () => void
  setMediaSelection: (ids: string[]) => void
  toggleMediaSelect: (id: string, mode: 'replace' | 'toggle' | 'range') => void
  undo: () => void
  redo: () => void
  addAssets: (assets: MediaAsset[]) => void
  patchAsset: (id: string, patch: Partial<MediaAsset>) => void
  addClipFromAsset: (assetId: string, trackId: string, start: number) => void
  addClipsFromAssets: (assetIds: string[], trackId: string, start: number) => void
  addTextClip: (trackId?: string) => void
  beginGesture: () => void
  endGesture: () => void
  moveClip: (id: string, start: number, trackId?: string) => void
  moveClipsFromOrigins: (
    origins: Record<string, number>,
    primaryId: string,
    primaryTarget: number,
    targetTrackId?: string,
  ) => void
  /** Snap to cut / split under drop, ripple others, place selection (call on drag end). */
  finalizeClipDrag: (ids: string[], trackId: string, dropTime: number) => void
  moveTextsFromOrigins: (
    origins: Record<string, number>,
    primaryId: string,
    primaryTarget: number,
  ) => void
  loadProjectState: (data: {
    name: string
    settings: ProjectState['settings']
    sequenceSized: boolean
    assets: MediaAsset[]
    tracks: Track[]
    clips: TimelineClip[]
    textClips: TextClip[]
    playhead: number
    zoom: number
    previewScale: number
  }) => void
  getSavePayload: () => {
    name: string
    settings: ProjectState['settings']
    sequenceSized: boolean
    assets: Omit<MediaAsset, 'thumbnail' | 'waveform'>[]
    tracks: Track[]
    clips: TimelineClip[]
    textClips: TextClip[]
    playhead: number
    zoom: number
    previewScale: number
  }
  trimClip: (id: string, edge: 'in' | 'out', time: number) => void
  updateSettings: (patch: Partial<ProjectSettings>) => void
  updateClip: (id: string, patch: Partial<TimelineClip>) => void
  /** Patch every selected clip (or the given ids). */
  updateClips: (ids: string[], patch: Partial<TimelineClip>) => void
  /** Apply a transform delta to many clips/texts around a pivot (Photoshop-style). */
  transformSelection: (delta: {
    dx?: number
    dy?: number
    scale?: number
    rotation?: number
    pivotX?: number
    pivotY?: number
  }) => void
  updateText: (id: string, patch: Partial<TextClip>) => void
  updateTexts: (ids: string[], patch: Partial<TextClip>) => void
  moveText: (id: string, start: number) => void
  trimText: (id: string, edge: 'in' | 'out', time: number) => void
  splitAtPlayhead: () => void
  deleteSelection: () => void
  copySelection: () => Promise<void>
  pasteClipboard: () => Promise<void>
  cutSelection: () => Promise<void>
  toggleTrackMute: (trackId: string) => void
  setTrackBlendMode: (trackId: string, blendMode: BlendModeId) => void
  /** Add a video (above existing video) or audio (below existing audio) track. */
  addTrack: (kind: 'video' | 'audio') => void
  /** Move track one row up (toward index 0) or down. */
  moveTrack: (trackId: string, direction: 'up' | 'down') => void
  /** Place `trackId` at the index of `targetId` (target shifts toward the gap). */
  reorderTrack: (trackId: string, targetId: string) => void
  ensureTracks: () => void
}

function nextTrackName(tracks: Track[], kind: 'video' | 'audio'): string {
  const prefix = kind === 'video' ? 'V' : 'A'
  let max = 0
  for (const t of tracks) {
    if (t.kind !== kind) continue
    const m = new RegExp(`^${prefix}(\\d+)$`, 'i').exec(t.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

function normalizeTrack(t: Partial<Track> & Pick<Track, 'id' | 'kind' | 'name'>): Track {
  const kind = t.kind
  const minH = kind === 'video' ? 72 : kind === 'text' ? 58 : 40
  return {
    id: t.id,
    kind,
    name: t.name,
    muted: Boolean(t.muted),
    locked: Boolean(t.locked),
    height: Math.max(t.height ?? minH, minH),
    blendMode: getBlendMode(t.blendMode).id,
  }
}

function defaultTracks(): Track[] {
  return [
    {
      id: 'text-1',
      kind: 'text',
      name: 'Text',
      muted: false,
      locked: false,
      height: 58,
      blendMode: DEFAULT_BLEND_MODE,
    },
    {
      id: 'v2',
      kind: 'video',
      name: 'V2',
      muted: false,
      locked: false,
      height: 72,
      blendMode: DEFAULT_BLEND_MODE,
    },
    {
      id: 'v1',
      kind: 'video',
      name: 'V1',
      muted: false,
      locked: false,
      height: 72,
      blendMode: DEFAULT_BLEND_MODE,
    },
    {
      id: 'a1',
      kind: 'audio',
      name: 'A1',
      muted: false,
      locked: false,
      height: 40,
      blendMode: DEFAULT_BLEND_MODE,
    },
  ]
}

function sliceOf(s: ProjectState): EditableSlice {
  return {
    assets: s.assets,
    tracks: s.tracks,
    clips: s.clips,
    textClips: s.textClips,
    settings: s.settings,
    name: s.name,
    sequenceSized: s.sequenceSized,
  }
}

function pushHistory(state: ProjectStore): void {
  if (state.gestureActive) return
  state.history.past.push(cloneData(sliceOf(current(state) as ProjectState)))
  if (state.history.past.length > MAX_HISTORY) state.history.past.shift()
  state.history.future = []
}

function effectiveDuration(clip: TimelineClip): number {
  return (clip.outPoint - clip.inPoint) / Math.max(clip.speed, 0.01)
}

function applySequenceSizeFromAsset(s: ProjectStore, asset: MediaAsset) {
  if (s.sequenceSized || !asset.hasVideo) return
  s.settings.width = asset.width || s.settings.width
  s.settings.height = asset.height || s.settings.height
  if (asset.fps > 1) s.settings.fps = Math.round(asset.fps * 1000) / 1000
  s.sequenceSized = true
}

function makeClip(asset: MediaAsset, trackId: string, start: number): TimelineClip {
  return {
    id: uuid(),
    assetId: asset.id,
    trackId,
    start: Math.max(0, start),
    duration: asset.duration,
    inPoint: 0,
    outPoint: asset.duration,
    speed: 1,
    reverse: false,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transitionIn: 0,
    ...DEFAULT_TRANSFORM,
  }
}

function normalizeClip(c: TimelineClip): TimelineClip {
  return { ...DEFAULT_TRANSFORM, ...c }
}

function normalizeText(t: Partial<TextClip> & Pick<TextClip, 'id' | 'trackId' | 'start' | 'duration' | 'text'>): TextClip {
  return {
    fontFamily: 'Inter',
    fontSize: 64,
    color: '#ffffff',
    bold: false,
    italic: false,
    align: 'center',
    verticalAlign: 'middle',
    ...DEFAULT_TEXT_STYLE,
    ...t,
    x: t.x ?? 0.5,
    y: t.y ?? 0.5,
  } as TextClip
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  name: 'Untitled Project',
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: defaultTracks(),
  clips: [],
  textClips: [],
  selection: { type: 'none' },
  selectedClipIds: [],
  selectedTextIds: [],
  selectedMediaIds: [],
  playhead: 0,
  zoom: 1,
  previewScale: 100,
  snapEnabled: true,
  isPlaying: false,
  tool: 'select',
  sequenceSized: false,
  history: { past: [], future: [] },
  clipboard: null,
  exportOpen: false,
  gestureActive: false,

  setExportOpen: (open) => set({ exportOpen: open }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (v) => set({ isPlaying: v }),
  setZoom: (z) => set({ zoom: clamp(z, 0.15, 8) }),
  setPreviewScale: (pct) => set({ previewScale: clamp(Math.round(pct), 25, 200) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setTool: (t) => set({ tool: t }),
  select: (sel) =>
    set({
      selection: sel,
      selectedClipIds: sel.type === 'clip' ? [sel.id] : [],
      selectedTextIds: sel.type === 'text' ? [sel.id] : [],
    }),
  clearTimelineSelection: () =>
    set({ selection: { type: 'none' }, selectedClipIds: [], selectedTextIds: [] }),
  selectTimelineClip: (id, mode) =>
    set(
      produce((s: ProjectStore) => {
        s.selectedTextIds = []
        if (mode === 'replace') {
          s.selectedClipIds = [id]
        } else if (mode === 'toggle') {
          s.selectedClipIds = s.selectedClipIds.includes(id)
            ? s.selectedClipIds.filter((x) => x !== id)
            : [...s.selectedClipIds, id]
        } else {
          const trackId = s.clips.find((c) => c.id === id)?.trackId
          const onTrack = s.clips
            .filter((c) => c.trackId === trackId)
            .sort((a, b) => a.start - b.start)
          const ids = onTrack.map((c) => c.id)
          const anchor = s.selectedClipIds[0] ?? id
          const a = ids.indexOf(anchor)
          const b = ids.indexOf(id)
          if (a < 0 || b < 0) s.selectedClipIds = [id]
          else {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            s.selectedClipIds = ids.slice(lo, hi + 1)
          }
        }
        s.selection =
          s.selectedClipIds.length > 0
            ? { type: 'clip', id: s.selectedClipIds[s.selectedClipIds.length - 1]! }
            : { type: 'none' }
      }),
    ),
  selectTimelineText: (id, mode) =>
    set(
      produce((s: ProjectStore) => {
        s.selectedClipIds = []
        if (mode === 'replace') {
          s.selectedTextIds = [id]
        } else if (mode === 'toggle') {
          s.selectedTextIds = s.selectedTextIds.includes(id)
            ? s.selectedTextIds.filter((x) => x !== id)
            : [...s.selectedTextIds, id]
        } else {
          const ordered = [...s.textClips].sort((a, b) => a.start - b.start)
          const ids = ordered.map((t) => t.id)
          const anchor = s.selectedTextIds[0] ?? id
          const a = ids.indexOf(anchor)
          const b = ids.indexOf(id)
          if (a < 0 || b < 0) s.selectedTextIds = [id]
          else {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            s.selectedTextIds = ids.slice(lo, hi + 1)
          }
        }
        s.selection =
          s.selectedTextIds.length > 0
            ? { type: 'text', id: s.selectedTextIds[s.selectedTextIds.length - 1]! }
            : { type: 'none' }
      }),
    ),
  setMediaSelection: (ids) => set({ selectedMediaIds: ids }),
  toggleMediaSelect: (id, mode) =>
    set(
      produce((s: ProjectStore) => {
        if (mode === 'replace') {
          s.selectedMediaIds = [id]
          return
        }
        if (mode === 'toggle') {
          if (s.selectedMediaIds.includes(id)) {
            s.selectedMediaIds = s.selectedMediaIds.filter((x) => x !== id)
          } else {
            s.selectedMediaIds.push(id)
          }
          return
        }
        // range
        const ids = s.assets.map((a) => a.id)
        const anchor = s.selectedMediaIds[0] ?? id
        const a = ids.indexOf(anchor)
        const b = ids.indexOf(id)
        if (a < 0 || b < 0) {
          s.selectedMediaIds = [id]
          return
        }
        const [lo, hi] = a < b ? [a, b] : [b, a]
        s.selectedMediaIds = ids.slice(lo, hi + 1)
      }),
    ),

  beginGesture: () =>
    set(
      produce((s: ProjectStore) => {
        if (s.gestureActive) return
        s.history.past.push(cloneData(sliceOf(current(s) as ProjectState)))
        if (s.history.past.length > MAX_HISTORY) s.history.past.shift()
        s.history.future = []
        s.gestureActive = true
      }),
    ),

  endGesture: () => set({ gestureActive: false }),

  undo: () =>
    set(
      produce((s: ProjectStore) => {
        const prev = s.history.past.pop()
        if (!prev) return
        s.history.future.push(cloneData(sliceOf(current(s) as ProjectState)))
        Object.assign(s, prev)
      }),
    ),

  redo: () =>
    set(
      produce((s: ProjectStore) => {
        const next = s.history.future.pop()
        if (!next) return
        s.history.past.push(cloneData(sliceOf(current(s) as ProjectState)))
        Object.assign(s, next)
      }),
    ),

  ensureTracks: () => {
    if (get().tracks.length === 0) set({ tracks: defaultTracks() })
  },

  addAssets: (assets) =>
    set(
      produce((s: ProjectStore) => {
        pushHistory(s)
        s.assets.push(...assets)
      }),
    ),

  patchAsset: (id, patch) =>
    set(
      produce((s: ProjectStore) => {
        const asset = s.assets.find((a) => a.id === id)
        if (asset) Object.assign(asset, patch)
      }),
    ),

  addClipFromAsset: (assetId, trackId, start) => {
    get().addClipsFromAssets([assetId], trackId, start)
  },

  addClipsFromAssets: (assetIds, trackId, start) =>
    set(
      produce((s: ProjectStore) => {
        const track = s.tracks.find((t) => t.id === trackId)
        if (!track || track.locked || track.kind === 'text') return
        const assets = assetIds
          .map((id) => s.assets.find((a) => a.id === id))
          .filter((a): a is MediaAsset => Boolean(a))
          .filter((asset) => {
            if (track.kind === 'audio') return asset.hasAudio || asset.kind === 'audio'
            return asset.hasVideo || asset.kind === 'image' || asset.hasAudio
          })
        if (assets.length === 0) return

        pushHistory(s)
        const empty = new Set<string>()
        let insertAt = start
        const covering = findCoveringClip(s.clips, trackId, start, empty)
        if (covering) {
          splitClipAtTime(s.clips, covering, start)
          insertAt = start
        } else {
          insertAt = closestCutOnTrack(start, s.clips, trackId, empty)
        }

        const totalDur = assets.reduce((sum, a) => sum + a.duration, 0)
        rippleForward(s.clips, trackId, insertAt, totalDur, empty)

        let cursor = insertAt
        let lastId = ''
        const newIds: string[] = []
        for (const asset of assets) {
          applySequenceSizeFromAsset(s, asset)
          const clip = makeClip(asset, trackId, cursor)
          s.clips.push(clip)
          newIds.push(clip.id)
          lastId = clip.id
          cursor += clip.duration
        }
        if (lastId) {
          s.selection = { type: 'clip', id: lastId }
          s.selectedClipIds = newIds
          s.selectedTextIds = []
        }
      }),
    ),

  addTextClip: (trackId) =>
    set(
      produce((s: ProjectStore) => {
        pushHistory(s)
        const tid = trackId ?? s.tracks.find((t) => t.kind === 'text')?.id
        if (!tid) return
        const text: TextClip = {
          id: uuid(),
          trackId: tid,
          start: s.playhead,
          duration: 4,
          text: 'Add your text',
          fontFamily: 'Inter',
          fontSize: 64,
          color: '#ffffff',
          bold: false,
          italic: false,
          align: 'center',
          verticalAlign: 'middle',
          x: 0.5,
          y: 0.5,
          ...DEFAULT_TEXT_STYLE,
        }
        s.textClips.push(text)
        s.selection = { type: 'text', id: text.id }
      }),
    ),

  moveClip: (id, start, trackId) => {
    const s = get()
    const origins: Record<string, number> = {}
    const ids =
      s.selectedClipIds.includes(id) && s.selectedClipIds.length > 1
        ? s.selectedClipIds
        : [id]
    for (const cid of ids) {
      const c = s.clips.find((x) => x.id === cid)
      if (c) origins[cid] = c.start
    }
    get().moveClipsFromOrigins(origins, id, start)
    if (trackId) {
      set(
        produce((st: ProjectStore) => {
          const c = st.clips.find((x) => x.id === id)
          if (c) c.trackId = trackId
        }),
      )
    }
  },

  moveClipsFromOrigins: (origins, primaryId, primaryTarget, targetTrackId) =>
    set(
      produce((s: ProjectStore) => {
        const ids = Object.keys(origins)
        if (ids.length === 0) return
        pushHistory(s)
        const moving = new Set(ids)
        const targets = collectSnapTargets(
          s.playhead,
          s.clips
            .filter((c) => !moving.has(c.id))
            .map((c) => ({ id: c.id, start: c.start, duration: c.duration })),
        )
        const snapped = snapTime(primaryTarget, targets, pxToTime(8, s.zoom), s.snapEnabled)
        const primaryOrig = origins[primaryId] ?? 0
        const delta = snapped.time - primaryOrig

        let nextTrack = targetTrackId
        if (nextTrack) {
          const track = s.tracks.find((t) => t.id === nextTrack)
          if (!track || track.locked || track.kind === 'text') nextTrack = undefined
        }

        for (const cid of ids) {
          const c = s.clips.find((x) => x.id === cid)
          const orig = origins[cid]
          if (!c || orig == null) continue
          c.start = Math.max(0, orig + delta)
          if (nextTrack) {
            const asset = s.assets.find((a) => a.id === c.assetId)
            const track = s.tracks.find((t) => t.id === nextTrack)
            if (!asset || !track) continue
            if (track.kind === 'audio' && !(asset.hasAudio || asset.kind === 'audio')) continue
            if (track.kind === 'video' && !(asset.hasVideo || asset.kind === 'image' || asset.hasAudio))
              continue
            c.trackId = nextTrack
          }
        }
      }),
    ),

  finalizeClipDrag: (ids, trackId, dropTime) =>
    set(
      produce((s: ProjectStore) => {
        if (ids.length === 0) return
        const track = s.tracks.find((t) => t.id === trackId)
        if (!track || track.locked || track.kind === 'text') return

        const movers = ids
          .map((id) => s.clips.find((c) => c.id === id))
          .filter((c): c is TimelineClip => Boolean(c))
        if (movers.length === 0) return

        for (const c of movers) {
          const asset = s.assets.find((a) => a.id === c.assetId)
          if (!asset) return
          if (track.kind === 'audio' && !(asset.hasAudio || asset.kind === 'audio')) return
          if (track.kind === 'video' && !(asset.hasVideo || asset.kind === 'image' || asset.hasAudio))
            return
        }

        const moving = new Set(ids)
        const minStart = Math.min(...movers.map((c) => c.start))
        const maxEnd = Math.max(...movers.map((c) => c.start + c.duration))
        const overlaps = s.clips.some(
          (c) =>
            c.trackId === trackId &&
            !moving.has(c.id) &&
            c.start < maxEnd - 1e-4 &&
            c.start + c.duration > minStart + 1e-4,
        )
        const covering = findCoveringClip(s.clips, trackId, Math.max(0, dropTime), moving)

        // Empty gap / no collision: keep free-drag times, only assign track
        if (!overlaps && !covering) {
          for (const c of movers) c.trackId = trackId
          return
        }

        pushHistory(s)
        let insertAt = Math.max(0, dropTime)
        if (covering) {
          splitClipAtTime(s.clips, covering, insertAt)
        } else {
          insertAt = closestCutOnTrack(insertAt, s.clips, trackId, moving)
        }

        const span = Math.max(0.01, maxEnd - minStart)
        const rel = movers.map((c) => ({ id: c.id, offset: c.start - minStart }))

        rippleForward(s.clips, trackId, insertAt, span, moving)

        for (const r of rel) {
          const c = s.clips.find((x) => x.id === r.id)
          if (!c) continue
          c.trackId = trackId
          c.start = insertAt + r.offset
        }
      }),
    ),

  moveTextsFromOrigins: (origins, primaryId, primaryTarget) =>
    set(
      produce((s: ProjectStore) => {
        const ids = Object.keys(origins)
        if (ids.length === 0) return
        pushHistory(s)
        const moving = new Set(ids)
        const targets = collectSnapTargets(
          s.playhead,
          [
            ...s.clips.map((c) => ({ id: c.id, start: c.start, duration: c.duration })),
            ...s.textClips
              .filter((t) => !moving.has(t.id))
              .map((t) => ({ id: t.id, start: t.start, duration: t.duration })),
          ],
        )
        const snapped = snapTime(primaryTarget, targets, pxToTime(8, s.zoom), s.snapEnabled)
        const primaryOrig = origins[primaryId] ?? 0
        const delta = snapped.time - primaryOrig
        for (const tid of ids) {
          const t = s.textClips.find((x) => x.id === tid)
          const orig = origins[tid]
          if (!t || orig == null) continue
          t.start = Math.max(0, orig + delta)
        }
      }),
    ),

  getSavePayload: () => {
    const s = get()
    return {
      name: s.name,
      settings: s.settings,
      sequenceSized: s.sequenceSized,
      assets: s.assets.map((a) => ({
        id: a.id,
        path: a.path,
        proxyPath: a.proxyPath,
        name: a.name,
        kind: a.kind,
        duration: a.duration,
        width: a.width,
        height: a.height,
        fps: a.fps,
        hasAudio: a.hasAudio,
        hasVideo: a.hasVideo,
        codec: a.codec,
      })),
      tracks: s.tracks,
      clips: s.clips,
      textClips: s.textClips,
      playhead: s.playhead,
      zoom: s.zoom,
      previewScale: s.previewScale,
    }
  },

  loadProjectState: (data) =>
    set({
      name: data.name,
      settings: data.settings,
      sequenceSized: data.sequenceSized,
      assets: data.assets,
      tracks: data.tracks.map((t) => normalizeTrack(t as Track)),
      clips: data.clips.map(normalizeClip),
      textClips: data.textClips.map(normalizeText),
      playhead: data.playhead,
      zoom: data.zoom,
      previewScale: data.previewScale,
      selection: { type: 'none' },
      selectedClipIds: [],
      selectedTextIds: [],
      selectedMediaIds: [],
      isPlaying: false,
      history: { past: [], future: [] },
      clipboard: null,
    }),

  trimClip: (id, edge, time) =>
    set(
      produce((s: ProjectStore) => {
        const clip = s.clips.find((c) => c.id === id)
        if (!clip) return
        const asset = s.assets.find((a) => a.id === clip.assetId)
        if (!asset) return
        pushHistory(s)

        const prevStart = clip.start
        const prevEnd = clip.start + clip.duration

        if (edge === 'in') {
          const newStart = clamp(time, 0, clip.start + clip.duration - 0.1)
          const delta = newStart - clip.start
          const srcDelta = delta * clip.speed
          clip.inPoint = clamp(clip.inPoint + srcDelta, 0, clip.outPoint - 0.05)
          clip.start = newStart
          clip.duration = effectiveDuration(clip)

          // Extending left into previous clips → push them earlier
          if (newStart < prevStart) {
            const grow = prevStart - newStart
            for (const c of s.clips) {
              if (c.id === id || c.trackId !== clip.trackId) continue
              if (c.start + c.duration > newStart + 1e-4 && c.start < prevStart + 1e-4) {
                c.start = Math.max(0, c.start - grow)
              }
            }
          }
        } else {
          const end = clamp(
            time,
            clip.start + 0.1,
            clip.start + (asset.duration - clip.inPoint) / clip.speed + 0.01,
          )
          const newDur = end - clip.start
          clip.outPoint = clamp(clip.inPoint + newDur * clip.speed, clip.inPoint + 0.05, asset.duration)
          clip.duration = effectiveDuration(clip)
          const newEnd = clip.start + clip.duration

          // Extending right into later clips → push them forward in realtime
          if (newEnd > prevEnd + 1e-4) {
            const grow = newEnd - prevEnd
            for (const c of s.clips) {
              if (c.id === id || c.trackId !== clip.trackId) continue
              if (c.start >= prevEnd - 1e-4) {
                c.start += grow
              } else if (c.start < newEnd && c.start + c.duration > clip.start) {
                const push = newEnd - c.start
                const from = c.start
                c.start += push
                for (const o of s.clips) {
                  if (o.id === id || o.id === c.id || o.trackId !== clip.trackId) continue
                  if (o.start >= from - 1e-4) o.start += push
                }
              }
            }
          }
        }
      }),
    ),

  updateSettings: (patch) =>
    set(
      produce((s: ProjectStore) => {
        const nextW = patch.width ?? s.settings.width
        const nextH = patch.height ?? s.settings.height
        const nextFps = patch.fps ?? s.settings.fps
        const width = Math.round(clamp(nextW, 16, 8192) / 2) * 2
        const height = Math.round(clamp(nextH, 16, 8192) / 2) * 2
        const fps = Math.round(clamp(nextFps, 1, 240) * 1000) / 1000
        if (
          width === s.settings.width &&
          height === s.settings.height &&
          fps === s.settings.fps
        ) {
          return
        }
        pushHistory(s)
        s.settings.width = width
        s.settings.height = height
        s.settings.fps = fps
        s.sequenceSized = true
      }),
    ),

  updateClip: (id, patch) =>
    set(
      produce((s: ProjectStore) => {
        const clip = s.clips.find((c) => c.id === id)
        if (!clip) return
        pushHistory(s)
        Object.assign(clip, patch)
        if (patch.speed != null || patch.inPoint != null || patch.outPoint != null) {
          clip.duration = effectiveDuration(clip)
        }
      }),
    ),

  updateClips: (ids, patch) =>
    set(
      produce((s: ProjectStore) => {
        if (!ids.length) return
        pushHistory(s)
        for (const id of ids) {
          const clip = s.clips.find((c) => c.id === id)
          if (!clip) continue
          Object.assign(clip, patch)
          if (patch.speed != null || patch.inPoint != null || patch.outPoint != null) {
            clip.duration = effectiveDuration(clip)
          }
        }
      }),
    ),

  transformSelection: (delta) =>
    set(
      produce((s: ProjectStore) => {
        const clipIds = s.selectedClipIds.length
          ? s.selectedClipIds
          : s.selection.type === 'clip'
            ? [s.selection.id]
            : []
        const textIds = s.selectedTextIds.length
          ? s.selectedTextIds
          : s.selection.type === 'text'
            ? [s.selection.id]
            : []
        if (!clipIds.length && !textIds.length) return
        pushHistory(s)
        const pivotX = delta.pivotX ?? 0.5
        const pivotY = delta.pivotY ?? 0.5
        const scale = delta.scale ?? 1
        const rot = delta.rotation ?? 0
        const dx = delta.dx ?? 0
        const dy = delta.dy ?? 0

        const apply = (el: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }) => {
          let x = el.x ?? 0.5
          let y = el.y ?? 0.5
          x = pivotX + (x - pivotX) * scale + dx
          y = pivotY + (y - pivotY) * scale + dy
          el.x = clamp(x, -0.5, 1.5)
          el.y = clamp(y, -0.5, 1.5)
          el.scaleX = (el.scaleX ?? 1) * scale
          el.scaleY = (el.scaleY ?? 1) * scale
          el.rotation = (el.rotation ?? 0) + rot
        }

        for (const id of clipIds) {
          const c = s.clips.find((x) => x.id === id)
          if (c) apply(c)
        }
        for (const id of textIds) {
          const t = s.textClips.find((x) => x.id === id)
          if (t) apply(t)
        }
      }),
    ),

  updateText: (id, patch) =>
    set(
      produce((s: ProjectStore) => {
        const text = s.textClips.find((t) => t.id === id)
        if (!text) return
        pushHistory(s)
        Object.assign(text, patch)
      }),
    ),

  updateTexts: (ids, patch) =>
    set(
      produce((s: ProjectStore) => {
        if (!ids.length) return
        pushHistory(s)
        for (const id of ids) {
          const text = s.textClips.find((t) => t.id === id)
          if (text) Object.assign(text, patch)
        }
      }),
    ),

  moveText: (id, start) =>
    set(
      produce((s: ProjectStore) => {
        const text = s.textClips.find((t) => t.id === id)
        if (!text) return
        pushHistory(s)
        const targets = collectSnapTargets(s.playhead, [
          ...s.clips.map((c) => ({ id: c.id, start: c.start, duration: c.duration })),
          ...s.textClips.map((t) => ({ id: t.id, start: t.start, duration: t.duration })),
        ], id)
        const snapped = snapTime(start, targets, pxToTime(8, s.zoom), s.snapEnabled).time
        const delta = snapped - text.start
        const ids =
          s.selectedTextIds.includes(id) && s.selectedTextIds.length > 1
            ? s.selectedTextIds
            : [id]
        for (const tid of ids) {
          const t = s.textClips.find((x) => x.id === tid)
          if (t) t.start = Math.max(0, t.start + delta)
        }
      }),
    ),

  trimText: (id, edge, time) =>
    set(
      produce((s: ProjectStore) => {
        const text = s.textClips.find((t) => t.id === id)
        if (!text) return
        pushHistory(s)
        const prevStart = text.start
        const prevEnd = text.start + text.duration
        if (edge === 'in') {
          const newStart = clamp(time, 0, text.start + text.duration - 0.2)
          text.duration -= newStart - text.start
          text.start = newStart
          if (newStart < prevStart) {
            const grow = prevStart - newStart
            for (const t of s.textClips) {
              if (t.id === id || t.trackId !== text.trackId) continue
              if (t.start + t.duration > newStart && t.start < prevStart) {
                t.start = Math.max(0, t.start - grow)
              }
            }
          }
        } else {
          text.duration = Math.max(0.2, time - text.start)
          const newEnd = text.start + text.duration
          if (newEnd > prevEnd) {
            const grow = newEnd - prevEnd
            for (const t of s.textClips) {
              if (t.id === id || t.trackId !== text.trackId) continue
              if (t.start >= prevEnd - 1e-4) t.start += grow
              else if (t.start < newEnd && t.start + t.duration > text.start) {
                t.start += newEnd - t.start
              }
            }
          }
        }
      }),
    ),

  splitAtPlayhead: () =>
    set(
      produce((s: ProjectStore) => {
        const t = s.playhead
        const clip = s.clips.find((c) => t > c.start + 0.05 && t < c.start + c.duration - 0.05)
        if (!clip) return
        pushHistory(s)
        const offset = (t - clip.start) * clip.speed
        const right: TimelineClip = {
          ...cloneData(clip),
          id: uuid(),
          start: t,
          inPoint: clip.inPoint + offset,
          duration: 0,
        }
        right.duration = effectiveDuration(right)
        clip.outPoint = clip.inPoint + offset
        clip.duration = effectiveDuration(clip)
        s.clips.push(right)
        s.selection = { type: 'clip', id: right.id }
        s.selectedClipIds = [right.id]
        s.selectedTextIds = []
      }),
    ),

  deleteSelection: () =>
    set(
      produce((s: ProjectStore) => {
        const clipIds = s.selectedClipIds.length
          ? s.selectedClipIds
          : s.selection.type === 'clip'
            ? [s.selection.id]
            : []
        const textIds = s.selectedTextIds.length
          ? s.selectedTextIds
          : s.selection.type === 'text'
            ? [s.selection.id]
            : []
        if (clipIds.length === 0 && textIds.length === 0) return
        pushHistory(s)
        if (clipIds.length) s.clips = s.clips.filter((c) => !clipIds.includes(c.id))
        if (textIds.length) s.textClips = s.textClips.filter((t) => !textIds.includes(t.id))
        s.selection = { type: 'none' }
        s.selectedClipIds = []
        s.selectedTextIds = []
      }),
    ),

  copySelection: async () => {
    const s = get()
    const clipIds = s.selectedClipIds.length
      ? s.selectedClipIds
      : s.selection.type === 'clip'
        ? [s.selection.id]
        : []
    const textIds = s.selectedTextIds.length
      ? s.selectedTextIds
      : s.selection.type === 'text'
        ? [s.selection.id]
        : []
    const clips = s.clips.filter((c) => clipIds.includes(c.id)).map(cloneData)
    const texts = s.textClips.filter((t) => textIds.includes(t.id)).map(cloneData)
    if (!clips.length && !texts.length) return

    const assetIds = new Set(clips.map((c) => c.assetId))
    const assets = s.assets
      .filter((a) => assetIds.has(a.id))
      .map(({ thumbnail: _t, waveform: _w, proxyPath: _p, proxyStatus: _s, ...rest }) => rest)

    const payload: ViditClipboardPayload = { version: 1, clips, texts, assets }
    set({ clipboard: payload })
    await writeSystemClipboardLayers(payload)
  },

  pasteClipboard: async () => {
    const fromSystem = await readSystemClipboardLayers()
    const payload = fromSystem ?? get().clipboard
    if (!payload || (!payload.clips.length && !payload.texts.length)) return

    set(
      produce((s: ProjectStore) => {
        pushHistory(s)
        if (fromSystem) s.clipboard = fromSystem

        // Rehydrate missing assets by path
        const idMap = new Map<string, string>()
        for (const a of payload.assets ?? []) {
          const existing = s.assets.find((x) => x.path === a.path)
          if (existing) {
            idMap.set(a.id, existing.id)
            continue
          }
          const nid = uuid()
          idMap.set(a.id, nid)
          s.assets.push({
            ...a,
            id: nid,
            thumbnail: '',
            waveform: [],
            proxyStatus: a.hasVideo && a.kind !== 'image' ? 'pending' : undefined,
          })
        }

        const clipStarts = payload.clips.map((c) => c.start)
        const textStarts = payload.texts.map((t) => t.start)
        const minStart = Math.min(
          clipStarts.length ? Math.min(...clipStarts) : Infinity,
          textStarts.length ? Math.min(...textStarts) : Infinity,
        )
        const base = Number.isFinite(minStart) ? minStart : 0
        const newClipIds: string[] = []
        const newTextIds: string[] = []

        for (const c of payload.clips) {
          const nid = uuid()
          const copy = normalizeClip({
            ...cloneData(c),
            id: nid,
            assetId: idMap.get(c.assetId) ?? c.assetId,
            start: s.playhead + (c.start - base),
          })
          s.clips.push(copy)
          newClipIds.push(nid)
        }
        for (const t of payload.texts) {
          const nid = uuid()
          const copy = normalizeText({
            ...cloneData(t),
            id: nid,
            start: s.playhead + (t.start - base),
          })
          s.textClips.push(copy)
          newTextIds.push(nid)
        }

        s.selectedClipIds = newClipIds
        s.selectedTextIds = newTextIds
        if (newClipIds.length) s.selection = { type: 'clip', id: newClipIds[newClipIds.length - 1] }
        else if (newTextIds.length)
          s.selection = { type: 'text', id: newTextIds[newTextIds.length - 1] }
      }),
    )

    // Kick proxy rebuild for newly added assets
    const { ensureAssetProxies } = await import('../lib/importMedia')
    ensureAssetProxies(get().assets)
  },

  cutSelection: async () => {
    await get().copySelection()
    get().deleteSelection()
  },

  toggleTrackMute: (trackId) =>
    set(
      produce((s: ProjectStore) => {
        const track = s.tracks.find((t) => t.id === trackId)
        if (track) track.muted = !track.muted
      }),
    ),

  setTrackBlendMode: (trackId, blendMode) =>
    set(
      produce((s: ProjectStore) => {
        const track = s.tracks.find((t) => t.id === trackId)
        if (!track || track.kind === 'audio') return
        const next = getBlendMode(blendMode).id
        if (track.blendMode === next) return
        pushHistory(s)
        track.blendMode = next
      }),
    ),

  addTrack: (kind) =>
    set(
      produce((s: ProjectStore) => {
        pushHistory(s)
        const track: Track = {
          id: uuid(),
          kind,
          name: nextTrackName(s.tracks, kind),
          muted: false,
          locked: false,
          height: kind === 'video' ? 72 : 40,
          blendMode: DEFAULT_BLEND_MODE,
        }
        if (kind === 'video') {
          // New video sits above existing video (earlier in list = higher composite)
          const firstVideo = s.tracks.findIndex((t) => t.kind === 'video')
          const firstAudio = s.tracks.findIndex((t) => t.kind === 'audio')
          const idx =
            firstVideo >= 0 ? firstVideo : firstAudio >= 0 ? firstAudio : s.tracks.length
          s.tracks.splice(idx, 0, track)
        } else {
          let lastAudio = -1
          for (let i = 0; i < s.tracks.length; i++) {
            if (s.tracks[i]?.kind === 'audio') lastAudio = i
          }
          if (lastAudio >= 0) s.tracks.splice(lastAudio + 1, 0, track)
          else s.tracks.push(track)
        }
      }),
    ),

  moveTrack: (trackId, direction) =>
    set(
      produce((s: ProjectStore) => {
        const i = s.tracks.findIndex((t) => t.id === trackId)
        if (i < 0) return
        const j = direction === 'up' ? i - 1 : i + 1
        if (j < 0 || j >= s.tracks.length) return
        pushHistory(s)
        const [track] = s.tracks.splice(i, 1)
        if (!track) return
        s.tracks.splice(j, 0, track)
      }),
    ),

  reorderTrack: (trackId, targetId) =>
    set(
      produce((s: ProjectStore) => {
        if (trackId === targetId) return
        const from = s.tracks.findIndex((t) => t.id === trackId)
        const to = s.tracks.findIndex((t) => t.id === targetId)
        if (from < 0 || to < 0) return
        pushHistory(s)
        const [track] = s.tracks.splice(from, 1)
        if (!track) return
        const insertAt = s.tracks.findIndex((t) => t.id === targetId)
        s.tracks.splice(insertAt < 0 ? s.tracks.length : insertAt, 0, track)
      }),
    ),
}))

export function getSequenceDuration(): number {
  const s = useProjectStore.getState()
  return projectDuration(s.clips, s.textClips)
}

export type { TextAlign, TextVAlign }
