/** Shared blob: URLs for H.264 proxies — avoid re-fetching ~2MB on every layer mount. */
const urls = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

export function getPreviewBlobUrl(filePath: string): Promise<string> {
  const cached = urls.get(filePath)
  if (cached) return Promise.resolve(cached)

  const inflight = pending.get(filePath)
  if (inflight) return inflight

  if (!window.vidit) {
    return Promise.reject(new Error('Desktop bridge missing'))
  }

  const job = (async () => {
    const res = await fetch(window.vidit.toMediaUrl(filePath))
    if (!res.ok) throw new Error(`Preview fetch failed (${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    urls.set(filePath, url)
    pending.delete(filePath)
    return url
  })().catch((err) => {
    pending.delete(filePath)
    throw err
  })

  pending.set(filePath, job)
  return job
}

export function peekPreviewBlobUrl(filePath: string): string | null {
  return urls.get(filePath) ?? null
}

/** Drop a cached blob when the proxy file path changes (e.g. GOP upgrade). */
export function forgetPreviewBlobUrl(filePath: string): void {
  const url = urls.get(filePath)
  if (!url) return
  URL.revokeObjectURL(url)
  urls.delete(filePath)
}
