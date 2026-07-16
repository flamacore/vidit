import type { TextClip } from '../types/project'

export const DEFAULT_TEXT_STYLE = {
  opacity: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  cropL: 0,
  cropR: 0,
  cropT: 0,
  cropB: 0,
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineWidth: 3,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowOpacity: 0.65,
  shadowBlur: 8,
  shadowOffsetX: 3,
  shadowOffsetY: 3,
  bevelEnabled: false,
  bevelDepth: 2,
} as const

export type TextStyleFields = typeof DEFAULT_TEXT_STYLE

export function withTextDefaults<T extends Partial<TextClip>>(t: T): T & TextStyleFields {
  return { ...DEFAULT_TEXT_STYLE, ...t }
}

/** `#rgb` / `#rrggbb` / `#rrggbbaa` → rgba() */
export function colorWithAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  const raw = (color || '#ffffff').replace('#', '')
  let hex = raw
  if (raw.length === 3) hex = raw.split('').map((c) => c + c).join('')
  else if (raw.length >= 6) hex = raw.slice(0, 6)
  else hex = 'ffffff'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(255,255,255,${a})`
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** FFmpeg drawtext fontcolor / bordercolor: `0xRRGGBB@A` */
export function ffmpegColor(color: string, alpha = 1): string {
  const raw = (color || '#ffffff').replace('#', '')
  let hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.slice(0, 6)
  if (hex.length < 6) hex = 'ffffff'
  const a = Math.max(0, Math.min(1, alpha))
  return `0x${hex.toUpperCase()}@${a.toFixed(3)}`
}

export function buildPreviewTextShadow(t: TextClip): string | undefined {
  const s = withTextDefaults(t)
  const parts: string[] = []

  if (s.bevelEnabled && s.bevelDepth > 0) {
    const d = s.bevelDepth
    parts.push(`${-d}px ${-d}px 0 rgba(255,255,255,0.55)`)
    parts.push(`${d}px ${d}px 0 rgba(0,0,0,0.55)`)
    if (d > 1) {
      parts.push(`${-d * 0.5}px ${-d * 0.5}px 0 rgba(255,255,255,0.25)`)
      parts.push(`${d * 0.5}px ${d * 0.5}px 0 rgba(0,0,0,0.3)`)
    }
  }

  if (s.shadowEnabled) {
    parts.push(
      `${s.shadowOffsetX}px ${s.shadowOffsetY}px ${s.shadowBlur}px ${colorWithAlpha(s.shadowColor, s.shadowOpacity)}`,
    )
  }

  return parts.length ? parts.join(', ') : undefined
}
