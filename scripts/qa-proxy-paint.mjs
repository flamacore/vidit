import { _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const proxyDir = 'C:\\TEMP\\vidit-proxies'
const proxy = path.join(proxyDir, 'e014c3abda2358702a44.mp4')
if (!fs.existsSync(proxy)) {
  console.error('missing proxy', proxy)
  process.exit(1)
}

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: '' },
})
const page = await app.firstWindow()
await page.waitForSelector('[data-testid="app-shell"]')

const result = await page.evaluate(async (proxyPath) => {
  const url = window.vidit.toMediaUrl(proxyPath)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  video.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:320px;z-index:9999;background:red'
  document.body.appendChild(video)

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout load')), 15000)
    video.onloadeddata = () => {
      clearTimeout(t)
      resolve(null)
    }
    video.onerror = () => {
      clearTimeout(t)
      reject(new Error(`video error ${video.error?.code}`))
    }
  })

  video.currentTime = 1
  await new Promise((r) => {
    video.onseeked = () => r(null)
    setTimeout(r, 2000)
  })

  video.crossOrigin = 'anonymous'
  // reload with CORS
  video.load()
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout cors load')), 15000)
    video.onloadeddata = () => {
      clearTimeout(t)
      resolve(null)
    }
    video.onerror = () => {
      clearTimeout(t)
      reject(new Error(`cors video error ${video.error?.code}`))
    }
  })
  video.currentTime = 1
  await new Promise((r) => {
    video.onseeked = () => r(null)
    setTimeout(r, 2000)
  })

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, 64, 64)
  let nonBlack = 0
  let avg = 0
  let taint = false
  try {
    const data = ctx.getImageData(0, 0, 64, 64).data
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] + data[i + 1] + data[i + 2]
      sum += v
      if (v > 30) nonBlack++
    }
    avg = sum / (data.length / 4)
  } catch (e) {
    taint = true
  }

  return {
    url: url.slice(0, 60),
    readyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    currentTime: video.currentTime,
    avg,
    nonBlack,
    taint,
  }
}, proxy)

console.log(result)
await app.close()
if (result.nonBlack < 50) {
  console.error('PAINT FAILED — mostly black')
  process.exit(1)
}
console.log('PAINT OK')
