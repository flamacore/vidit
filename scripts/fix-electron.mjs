import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { downloadArtifact } = require('@electron/get')
const { version } = require('../node_modules/electron/package.json')

const dist = path.resolve('node_modules/electron/dist')
fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(dist, { recursive: true })

const zip = await downloadArtifact({
  version,
  artifactName: 'electron',
  platform: process.platform,
  arch: process.arch,
  force: true,
})
console.log('zip', zip)

// Prefer PowerShell Expand-Archive / tar on Windows
try {
  execFileSync(
    'tar',
    ['-xf', zip, '-C', dist],
    { stdio: 'inherit' },
  )
} catch {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dist}' -Force`],
    { stdio: 'inherit' },
  )
}

fs.writeFileSync(path.join('node_modules/electron', 'path.txt'), 'electron.exe')
fs.writeFileSync(path.join(dist, 'version'), version)
console.log('electron.exe', fs.existsSync(path.join(dist, 'electron.exe')))
console.log(fs.readdirSync(dist).slice(0, 15))
