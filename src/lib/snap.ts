export interface SnapTarget {
  time: number
  label?: string
}

export function collectSnapTargets(
  playhead: number,
  clips: { id: string; start: number; duration: number }[],
  excludeId?: string,
): SnapTarget[] {
  const targets: SnapTarget[] = [{ time: 0, label: 'start' }, { time: playhead, label: 'playhead' }]
  for (const c of clips) {
    if (c.id === excludeId) continue
    targets.push({ time: c.start, label: 'edge' })
    targets.push({ time: c.start + c.duration, label: 'edge' })
  }
  return targets
}

export function snapTime(
  time: number,
  targets: SnapTarget[],
  threshold: number,
  enabled: boolean,
): { time: number; snapped: boolean } {
  if (!enabled) return { time, snapped: false }
  let best = time
  let bestDist = threshold
  let snapped = false
  for (const t of targets) {
    const d = Math.abs(t.time - time)
    if (d <= bestDist) {
      bestDist = d
      best = t.time
      snapped = true
    }
  }
  return { time: best, snapped }
}
