#!/usr/bin/env node
/**
 * Write package.json "version" from a semver string (with or without leading v).
 * Usage: node scripts/sync-version-from-tag.mjs 0.2.0
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const versionRaw = process.argv[2]
if (!versionRaw) {
  console.error('Usage: node scripts/sync-version-from-tag.mjs <semver>')
  process.exit(1)
}

const version = versionRaw.replace(/^v/i, '')
if (!/^\d+\.\d+\.\d+([.-][\w.-]+)?$/.test(version)) {
  console.error(`Invalid semver: ${versionRaw}`)
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.version = version
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`package.json version → ${version}`)
