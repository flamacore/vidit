import { _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sample = path.join(root, 'test-fixtures/sample.mp4')
const hevc = path.join(root, 'test-fixtures/hevc-portrait.mp4')
const target = process.argv.includes('--hevc') ? hevc : sample

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: '' },
})
const page = await app.firstWindow()
await page.waitForSelector('[data-testid="app-shell"]')

const hasProxyApi = await page.evaluate(() => typeof window.vidit?.ensurePreviewProxy === 'function')
console.log('ensurePreviewProxy', hasProxyApi)
if (!hasProxyApi) {
  console.error('MISSING ensurePreviewProxy')
  await app.close()
  process.exit(1)
}

const probeOk = await page.evaluate(async (p) => {
  const r = await window.vidit.probe(p)
  return { duration: r.duration, hasVideo: r.hasVideo, w: r.width, h: r.height, codec: r.codec }
}, target)
console.log('probe', probeOk)

await page.evaluate(async (p) => {
  await window.__viditImportPaths([p])
  const s = window.__viditStore.getState()
  const asset = s.assets[0]
  s.addClipFromAsset(asset.id, 'v1', 0)
  s.setPlayhead(0.5)
}, target)

const proxy = await page.waitForFunction(
  () => {
    const a = window.__viditStore.getState().assets[0]
    return a?.proxyPath
      ? { path: a.proxyPath, status: a.proxyStatus }
      : a?.proxyStatus === 'error'
        ? { path: null, status: 'error' }
        : null
  },
  { timeout: 60000 },
)
console.log('proxy', await proxy.jsonValue())

// Wait for blob: src + decoded frame
const preview = await page.waitForFunction(
  () => {
    const v = document.querySelector('video.preview-layer-media')
    if (!v) return null
    if (!v.videoWidth || v.readyState < 2) return null
    return {
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      currentTime: v.currentTime,
      srcKind: (v.currentSrc || v.src).startsWith('blob:') ? 'blob' : 'other',
      error: v.error ? `${v.error.code}` : null,
    }
  },
  { timeout: 30000 },
)
console.log('preview', await preview.jsonValue())

// Pixel check via canvas (blob: is same-origin)
const pixels = await page.evaluate(async () => {
  const v = document.querySelector('video.preview-layer-media')
  if (!v || !v.videoWidth) return { nonBlack: 0 }
  const c = document.createElement('canvas')
  c.width = 48
  c.height = 48
  const ctx = c.getContext('2d')
  ctx.drawImage(v, 0, 0, 48, 48)
  const data = ctx.getImageData(0, 0, 48, 48).data
  let nonBlack = 0
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const x = data[i] + data[i + 1] + data[i + 2]
    sum += x
    if (x > 30) nonBlack++
  }
  return { nonBlack, avg: sum / (data.length / 4) }
})
console.log('pixels', pixels)

await page.getByTestId('play-pause').click()
await page.waitForTimeout(800)
const playing = await page.evaluate(() => {
  const v = document.querySelector('video.preview-layer-media')
  return {
    isPlayingStore: window.__viditStore.getState().isPlaying,
    paused: v?.paused ?? null,
    currentTime: v?.currentTime ?? null,
  }
})
console.log('playing', playing)

await app.close()

if (pixels.nonBlack < 20) {
  console.error('PREVIEW FAILED — black frames')
  process.exit(1)
}
if (playing.paused !== false && playing.isPlayingStore) {
  console.error('PLAY FAILED')
  process.exit(1)
}
console.log('PREVIEW OK')
