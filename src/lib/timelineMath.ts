export const PX_PER_SECOND_BASE = 80

export function timeToPx(time: number, zoom: number): number {
  return time * PX_PER_SECOND_BASE * zoom
}

export function pxToTime(px: number, zoom: number): number {
  return px / (PX_PER_SECOND_BASE * zoom)
}

export function formatTimecode(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const frames = Math.floor((s % 1) * 30)
  return `${m}:${String(sec).padStart(2, '0')}.${String(frames).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${String(Number(sec).toFixed(1)).padStart(4, '0')}` : `${Number(sec).toFixed(1)}s`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function projectDuration(
  clips: { start: number; duration: number }[],
  texts: { start: number; duration: number }[],
): number {
  let max = 10
  for (const c of clips) max = Math.max(max, c.start + c.duration)
  for (const t of texts) max = Math.max(max, t.start + t.duration)
  return max
}
