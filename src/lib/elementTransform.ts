/** Shared spatial transform for timeline clips and text */

export interface ElementTransform {
  /** Center X in frame, 0–1 */
  x: number
  /** Center Y in frame, 0–1 */
  y: number
  scaleX: number
  scaleY: number
  /** Degrees clockwise */
  rotation: number
  /** 0–1 */
  opacity: number
  /** Crop insets 0–1 of source */
  cropL: number
  cropR: number
  cropT: number
  cropB: number
}

export const DEFAULT_TRANSFORM: ElementTransform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  cropL: 0,
  cropR: 0,
  cropT: 0,
  cropB: 0,
}

export function withTransform<T extends Partial<ElementTransform>>(t: T): T & ElementTransform {
  return { ...DEFAULT_TRANSFORM, ...t }
}

export function transformStyle(t: ElementTransform): {
  transform: string
  left: string
  top: string
  opacity: number
  clipPath: string
} {
  const tx = (t.x - 0.5) * 100
  const ty = (t.y - 0.5) * 100
  const cropOk = t.cropL > 0 || t.cropR > 0 || t.cropT > 0 || t.cropB > 0
  return {
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) translate(${tx}%, ${ty}%) rotate(${t.rotation}deg) scale(${t.scaleX}, ${t.scaleY})`,
    opacity: t.opacity,
    clipPath: cropOk
      ? `inset(${t.cropT * 100}% ${t.cropR * 100}% ${t.cropB * 100}% ${t.cropL * 100}%)`
      : 'none',
  }
}

/** Axis-aligned bbox in normalized frame space for an element with unit size centered. */
export function elementBounds(t: ElementTransform): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const w = Math.abs(t.scaleX) * (1 - t.cropL - t.cropR)
  const h = Math.abs(t.scaleY) * (1 - t.cropT - t.cropB)
  // Approximate without full rotation AABB for handles (good enough for small angles)
  const rad = (t.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const bw = w * cos + h * sin
  const bh = w * sin + h * cos
  return {
    minX: t.x - bw / 2,
    maxX: t.x + bw / 2,
    minY: t.y - bh / 2,
    maxY: t.y + bh / 2,
  }
}

export function unionBounds(
  boxes: { minX: number; minY: number; maxX: number; maxY: number }[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!boxes.length) return null
  return boxes.reduce(
    (acc, b) => ({
      minX: Math.min(acc.minX, b.minX),
      minY: Math.min(acc.minY, b.minY),
      maxX: Math.max(acc.maxX, b.maxX),
      maxY: Math.max(acc.maxY, b.maxY),
    }),
    boxes[0],
  )
}
