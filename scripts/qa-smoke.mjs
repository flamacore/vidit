import { _electron as electron } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sample = path.join(root, 'test-fixtures/sample.mp4')

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: '' },
})
const page = await app.firstWindow()
await page.waitForSelector('[data-testid="app-shell"]')

const bridge = await page.evaluate(() => ({
  hasVidit: Boolean(window.vidit),
  keys: window.vidit ? Object.keys(window.vidit) : [],
}))
console.log('bridge', bridge)

const direct = await page.evaluate(async (p) => {
  try {
    return await window.__viditImportPaths(p)
  } catch (e) {
    return { err: String(e) }
  }
}, [sample])
console.log('direct import', direct)
console.log('cards after direct', await page.locator('[data-testid="media-card"]').count())

await app.evaluate(async (electron, filePath) => {
  electron.dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [filePath],
  })
}, sample)

await page.evaluate(() => {
  // clear assets for dialog test
  const s = window.__viditStore.getState()
  s.assets.length = 0
})

// Force re-render by adding empty via store properly
await page.evaluate(() => {
  window.__viditStore.setState({ assets: [] })
})

await page.getByTestId('import-media').click()
await page.waitForTimeout(4000)
const err = await page.locator('[data-testid="import-error"]').textContent().catch(() => null)
console.log('after dialog', {
  err,
  cards: await page.locator('[data-testid="media-card"]').count(),
})

await app.close()
