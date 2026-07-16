import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const fixtures = path.join(root, 'test-fixtures')
const sampleVideo = path.join(fixtures, 'sample.mp4')
const sampleAudio = path.join(fixtures, 'sample.wav')
const exportOut = path.join(fixtures, 'qa-export.mp4')

async function launchBuiltApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [root],
    cwd: root,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: '',
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 45000 })
  return { app, page }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  const make = spawnSync(process.execPath, [path.join(root, 'scripts/make-fixtures.mjs')], {
    cwd: root,
    encoding: 'utf8',
  })
  if (make.status !== 0) {
    throw new Error(`fixture generation failed:\n${make.stderr}\n${make.stdout}`)
  }
  expect(fs.existsSync(sampleVideo)).toBeTruthy()
})

test('preload bridge is available and text is non-selectable', async () => {
  const { app, page } = await launchBuiltApp()

  const hasBridge = await page.evaluate(() => Boolean(window.vidit?.probe && window.vidit?.selectMediaFiles))
  expect(hasBridge).toBe(true)
  await expect(page.locator('[data-testid="bridge-missing"]')).toHaveCount(0)

  const userSelect = await page.evaluate(() => getComputedStyle(document.body).userSelect)
  expect(['none', '-webkit-none']).toContain(userSelect)

  const selection = await page.evaluate(() => {
    const brand = document.querySelector('.titlebar-brand') as HTMLElement
    const r = brand.getBoundingClientRect()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(brand)
    sel?.addRange(range)
    // Even if JS selects, drag UX uses CSS; verify computed style blocks user drag-select
    return getComputedStyle(brand).userSelect
  })
  expect(['none', '-webkit-none']).toContain(selection)

  await app.close()
})

test('import dialog, timeline edit, text, play, export', async () => {
  const { app, page } = await launchBuiltApp()

  await app.evaluate(async (electron, filePath) => {
    electron.dialog.showOpenDialog = async () =>
      ({
        canceled: false,
        filePaths: [filePath],
      }) as Electron.OpenDialogReturnValue
  }, sampleVideo)

  await page.getByTestId('import-media').click()
  await expect(page.locator('[data-testid="media-card"]')).toHaveCount(1, { timeout: 30000 })

  // Second import via helper (audio)
  const audioImport = await page.evaluate(async (p) => window.__viditImportPaths!([p]), sampleAudio)
  expect(audioImport.imported).toBe(1)
  await expect(page.locator('[data-testid="media-card"]')).toHaveCount(2)

  // Add video clip to timeline — sequence size follows first video
  await page.evaluate(() => {
    const store = window.__viditStore!.getState()
    const asset = store.assets.find((a) => a.kind === 'video')!
    store.addClipFromAsset(asset.id, 'v1', 0)
  })
  await expect(page.locator('.clip.video')).toHaveCount(1)
  const seq = await page.evaluate(() => {
    const s = window.__viditStore!.getState()
    return { w: s.settings.width, h: s.settings.height, sized: s.sequenceSized }
  })
  expect(seq.sized).toBe(true)
  expect(seq.w).toBe(640)
  expect(seq.h).toBe(360)

  // Multi-asset sequencing
  await page.evaluate(() => {
    const store = window.__viditStore!.getState()
    const ids = store.assets.map((a) => a.id)
    store.addClipsFromAssets(ids, 'v1', 10)
  })
  const sequenced = await page.evaluate(() => {
    const clips = window.__viditStore!.getState().clips.filter((c) => c.start >= 10)
    return clips.map((c) => ({ start: c.start, duration: c.duration }))
  })
  expect(sequenced.length).toBeGreaterThanOrEqual(2)
  expect(sequenced[1]!.start).toBeCloseTo(sequenced[0]!.start + sequenced[0]!.duration, 2)

  await page.locator('.clip.video').first().click()
  await page.evaluate(() => {
    const s = window.__viditStore!.getState()
    const id = s.clips[0]!.id
    s.select({ type: 'clip', id })
    s.updateClip(id, {
      speed: 2,
      reverse: true,
      volume: 0.5,
      fadeIn: 0.2,
      transitionIn: 0.3,
    })
  })

  const clipMeta = await page.evaluate(() => {
    const c = window.__viditStore!.getState().clips[0]!
    return { speed: c.speed, reverse: c.reverse, volume: c.volume }
  })
  expect(clipMeta.speed).toBe(2)
  expect(clipMeta.reverse).toBe(true)

  const beforeSplit = await page.evaluate(() => window.__viditStore!.getState().clips.length)
  await page.evaluate(() => {
    const s = window.__viditStore!.getState()
    const first = s.clips[0]!
    s.setPlayhead(first.start + first.duration * 0.25)
    s.splitAtPlayhead()
  })
  expect(await page.evaluate(() => window.__viditStore!.getState().clips.length)).toBe(beforeSplit + 1)

  await page.getByTestId('add-text').click()
  await expect(page.locator('.clip.text')).toHaveCount(1)
  await page.evaluate(() => {
    const s = window.__viditStore!.getState()
    s.updateText(s.textClips[0]!.id, { text: 'QA Title', fontSize: 48 })
  })
  expect(await page.evaluate(() => window.__viditStore!.getState().textClips[0]?.text)).toBe('QA Title')

  await page.evaluate(() => {
    const s = window.__viditStore!.getState()
    s.select({ type: 'text', id: s.textClips[0]!.id })
    s.copySelection()
    s.setPlayhead(2)
    s.pasteClipboard()
  })
  expect(await page.evaluate(() => window.__viditStore!.getState().textClips.length)).toBe(2)

  await page.getByTestId('undo').click()
  expect(await page.evaluate(() => window.__viditStore!.getState().textClips.length)).toBe(1)

  await page.getByTestId('play-pause').click()
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.__viditStore!.getState().isPlaying)).toBe(true)
  await page.getByTestId('play-pause').click()

  await page.getByTestId('tool-razor').click()
  expect(await page.evaluate(() => window.__viditStore!.getState().tool)).toBe('razor')
  await page.getByTestId('tool-select').click()
  await page.getByTestId('tool-snap').click()

  // Scrub ruler
  await page.locator('.ruler').click({ position: { x: 120, y: 8 } })
  const playhead = await page.evaluate(() => window.__viditStore!.getState().playhead)
  expect(playhead).toBeGreaterThan(0)

  if (fs.existsSync(exportOut)) fs.unlinkSync(exportOut)

  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-modal')).toBeVisible()

  const exportError = await page.evaluate(async (outPath) => {
    const state = window.__viditStore!.getState()
    const duration = Math.max(
      1,
      ...state.clips.map((c) => c.start + c.duration),
      ...state.textClips.map((t) => t.start + t.duration),
    )
    const plan = {
      width: state.settings.width,
      height: state.settings.height,
      fps: state.settings.fps,
      duration,
      container: 'mp4' as const,
      codec: 'h264' as const,
      outputPath: outPath,
      clips: state.clips.map((c) => {
        const asset = state.assets.find((a) => a.id === c.assetId)!
        return {
          id: c.id,
          path: asset.path,
          trackIndex: 0,
          start: c.start,
          duration: c.duration,
          inPoint: c.inPoint,
          outPoint: c.outPoint,
          speed: c.speed,
          reverse: c.reverse,
          volume: c.volume,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          transitionIn: c.transitionIn,
          hasVideo: asset.hasVideo,
          hasAudio: asset.hasAudio,
        }
      }),
      texts: state.textClips.map((t) => ({
        id: t.id,
        text: t.text,
        start: t.start,
        duration: t.duration,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        color: t.color,
        bold: t.bold,
        italic: t.italic,
        align: t.align,
        verticalAlign: t.verticalAlign,
        x: t.x,
        y: t.y,
      })),
    }
    try {
      await window.vidit.exportProject(plan)
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, exportOut)

  expect(exportError, exportError).toBe('')
  expect(fs.existsSync(exportOut)).toBeTruthy()
  expect(fs.statSync(exportOut).size).toBeGreaterThan(1000)

  await app.close()
})
