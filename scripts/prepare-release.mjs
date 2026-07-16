#!/usr/bin/env node
/**
 * Prepare a deliberate release (does not push or create the GitHub Release).
 *
 * Usage:
 *   npm run release:prepare -- 0.2.0
 *
 * Then commit, tag, and push the tag to trigger .github/workflows/release.yml:
 *   git add -A && git commit -m "chore: release v0.2.0"
 *   git tag -a v0.2.0 -m "Vidit v0.2.0"
 *   git push origin HEAD
 *   git push origin v0.2.0
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const versionRaw = process.argv[2]
if (!versionRaw) {
  console.error('Usage: npm run release:prepare -- <semver>')
  console.error('Example: npm run release:prepare -- 0.2.0')
  process.exit(1)
}

const version = versionRaw.replace(/^v/i, '')
const tag = `v${version}`
if (!/^\d+\.\d+\.\d+([.-][\w.-]+)?$/.test(version)) {
  console.error(`Invalid semver: ${versionRaw}`)
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const prevVersion = pkg.version
pkg.version = version
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const prevTag = sh('git describe --tags --abbrev=0')
const range = prevTag ? `${prevTag}..HEAD` : 'HEAD'
const log = sh(`git log ${range} --pretty=format:- %s (%h)`) || '(no commits found in range)'

console.log(`
package.json: ${prevVersion} → ${version}

Changes since ${prevTag || 'the beginning'}:
${log}

Next steps (nothing is published until you push the tag):
  1. Commit version bump + any pending work
  2. git tag -a ${tag} -m "Vidit ${tag}"
  3. git push origin HEAD
  4. git push origin ${tag}

That tag push runs the Release workflow (NSIS installer → GitHub Release with
auto-generated notes since the previous tag). Ordinary commits do not release.

Or: Actions → Release → Run workflow → tag ${tag}
`)
