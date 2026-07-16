/** Rough default target video bitrate from frame size (kbps). */
export function suggestVideoBitrateKbps(width: number, height: number, fps: number): number {
  const pixels = Math.max(1, width * height)
  const f = Math.max(1, fps)
  const kbps = Math.round((pixels * f * 0.1) / 1000)
  return Math.min(80_000, Math.max(1_500, kbps))
}

export function formatExportSizeEstimate(
  durationSec: number,
  videoBitrateKbps: number,
  audioBitrateKbps: number,
): string {
  const bits = Math.max(0, durationSec) * (videoBitrateKbps + audioBitrateKbps) * 1000
  const bytes = bits / 8
  if (bytes < 1024 * 1024) return `~${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `~${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
