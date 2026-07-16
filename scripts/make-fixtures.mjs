import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ffmpeg = require('ffmpeg-static')
const root = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(root, '..', 'test-fixtures')
fs.mkdirSync(dir, { recursive: true })

const video = path.join(dir, 'sample.mp4')
const audio = path.join(dir, 'sample.wav')

function run(args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(r.stderr)
    process.exit(r.status ?? 1)
  }
}

run([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc=size=640x360:rate=30',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=44100',
  '-t',
  '3',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  video,
])

run([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:sample_rate=44100',
  '-t',
  '2',
  audio,
])

console.log('fixtures:', video, audio)
