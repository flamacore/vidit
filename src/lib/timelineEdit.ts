import { v4 as uuid } from 'uuid'
import type { TimelineClip } from '../types/project'

/** Nearest cut among clip edges on a track (plus t=0). */
export function closestCutOnTrack(
  time: number,
  clips: TimelineClip[],
  trackId: string,
  excludeIds: Set<string>,
): number {
  const cuts = [0]
  for (const c of clips) {
    if (c.trackId !== trackId || excludeIds.has(c.id)) continue
    cuts.push(c.start, c.start + c.duration)
  }
  let best = 0
  let bestDist = Infinity
  for (const cut of cuts) {
    const d = Math.abs(cut - time)
    if (d < bestDist) {
      bestDist = d
      best = cut
    }
  }
  return Math.max(0, best)
}

export function findCoveringClip(
  clips: TimelineClip[],
  trackId: string,
  time: number,
  excludeIds: Set<string>,
): TimelineClip | undefined {
  return clips.find(
    (c) =>
      c.trackId === trackId &&
      !excludeIds.has(c.id) &&
      time > c.start + 0.05 &&
      time < c.start + c.duration - 0.05,
  )
}

/** Split a clip at `time` (mutates array). Returns the new right-hand clip. */
export function splitClipAtTime(clips: TimelineClip[], clip: TimelineClip, time: number): TimelineClip {
  const offset = (time - clip.start) * clip.speed
  const right: TimelineClip = {
    ...(JSON.parse(JSON.stringify(clip)) as TimelineClip),
    id: uuid(),
    start: time,
    inPoint: clip.inPoint + offset,
    duration: 0,
  }
  right.outPoint = clip.outPoint
  right.duration = (right.outPoint - right.inPoint) / Math.max(right.speed, 0.01)
  clip.outPoint = clip.inPoint + offset
  clip.duration = (clip.outPoint - clip.inPoint) / Math.max(clip.speed, 0.01)
  clips.push(right)
  return right
}

/** Shift clips on a track that start at/after insertAt by `amount` (ripple insert). */
export function rippleForward(
  clips: TimelineClip[],
  trackId: string,
  insertAt: number,
  amount: number,
  excludeIds: Set<string>,
): void {
  if (amount <= 0) return
  for (const c of clips) {
    if (c.trackId !== trackId || excludeIds.has(c.id)) continue
    if (c.start >= insertAt - 1e-6) c.start += amount
  }
}

export function selectionSpan(
  clips: TimelineClip[],
  ids: string[],
): { start: number; end: number; duration: number } {
  let start = Infinity
  let end = 0
  for (const id of ids) {
    const c = clips.find((x) => x.id === id)
    if (!c) continue
    start = Math.min(start, c.start)
    end = Math.max(end, c.start + c.duration)
  }
  if (!Number.isFinite(start)) return { start: 0, end: 0, duration: 0 }
  return { start, end, duration: end - start }
}
