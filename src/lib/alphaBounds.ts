export type NormRect = { minX: number; minY: number; maxX: number; maxY: number }

export type AlphaInsets = { l: number; t: number; r: number; b: number }

const insetCache = new Map<string, AlphaInsets>()

const FULL: AlphaInsets = { l: 0, t: 0, r: 0, b: 0 }

/** Opaque-pixel insets (0–1) for an image/video frame. Cached by key. */
export function computeAlphaInsets(
  source: CanvasImageSource & { videoWidth?: number; naturalWidth?: number; videoHeight?: number; naturalHeight?: number },
  cacheKey: string,
  threshold = 12,
): AlphaInsets {
  const hit = insetCache.get(cacheKey)
  if (hit) return hit

  const sw =
    (source as HTMLVideoElement).videoWidth ||
    (source as HTMLImageElement).naturalWidth ||
    0
  const sh =
    (source as HTMLVideoElement).videoHeight ||
    (source as HTMLImageElement).naturalHeight ||
    0
  if (sw < 2 || sh < 2) return FULL

  const maxSide = 96
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return FULL

  try {
    ctx.drawImage(source, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3]
        if (a > threshold) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) {
      insetCache.set(cacheKey, FULL)
      return FULL
    }
    // Near-full opaque frames → skip insets (typical video)
    const coverage = ((maxX - minX + 1) * (maxY - minY + 1)) / (w * h)
    if (coverage > 0.92 && minX <= 1 && minY <= 1 && maxX >= w - 2 && maxY >= h - 2) {
      insetCache.set(cacheKey, FULL)
      return FULL
    }
    const insets: AlphaInsets = {
      l: minX / w,
      t: minY / h,
      r: (w - 1 - maxX) / w,
      b: (h - 1 - maxY) / h,
    }
    insetCache.set(cacheKey, insets)
    return insets
  } catch {
    return FULL
  }
}

/** Map an element's screen rect (+ optional alpha insets) into normalized frame space. */
export function elementScreenBounds(
  el: Element,
  frame: DOMRect,
  insets: AlphaInsets = FULL,
): NormRect | null {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1 || frame.width < 1 || frame.height < 1) return null

  const left = r.left - frame.left + r.width * insets.l
  const top = r.top - frame.top + r.height * insets.t
  const right = r.right - frame.left - r.width * insets.r
  const bottom = r.bottom - frame.top - r.height * insets.b

  return {
    minX: left / frame.width,
    minY: top / frame.height,
    maxX: right / frame.width,
    maxY: bottom / frame.height,
  }
}

export function invalidateAlphaInsets(cacheKey?: string): void {
  if (cacheKey) insetCache.delete(cacheKey)
  else insetCache.clear()
}
