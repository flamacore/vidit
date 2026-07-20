import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getBlendMode } from '../shared/blendModes'
import { suggestVideoBitrateKbps } from '../shared/exportBitrate'
import type {
  ExportPlan,
  ExportProgress,
  ProbeResult,
  ThumbnailResult,
  WaveformResult,
} from './types'

const require = createRequire(import.meta.url)

/** Binaries cannot be spawned from inside app.asar — prefer unpacked / extraResources. */
function resolveBinary(candidate: string | null | undefined, label: string): string {
  const tried: string[] = []
  const consider = (p: string | null | undefined) => {
    if (!p) return null
    const variants = [
      p,
      // Classic Electron packaging fix
      p.replace(/app\.asar(?!\.unpacked)/g, 'app.asar.unpacked'),
    ]
    for (const v of variants) {
      if (!v || tried.includes(v)) continue
      tried.push(v)
      if (fs.existsSync(v)) return v
    }
    return null
  }

  // Packaged install: binaries copied next to resources via extraResources
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? `${label}.exe` : label
    const fromResources = path.join(process.resourcesPath, 'ffmpeg', exe)
    const hit = consider(fromResources)
    if (hit) return hit
  }

  const hit = consider(candidate)
  if (hit) return hit

  throw new Error(
    `${label} binary not found. Looked in:\n${tried.map((t) => `  - ${t}`).join('\n')}`,
  )
}

const ffmpegPath = resolveBinary(require('ffmpeg-static') as string, 'ffmpeg')
const ffprobePath = resolveBinary(
  (require('ffprobe-static') as { path: string }).path,
  'ffprobe',
)

function run(
  bin: string,
  args: string[],
  onStderr?: (chunk: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString()
      stderr += text
      onStderr?.(text)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.fbx') {
    return {
      path: filePath,
      kind: 'model',
      duration: 5,
      width: 0,
      height: 0,
      fps: 30,
      hasAudio: false,
      hasVideo: false,
      codec: 'fbx',
    }
  }

  const args = [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]
  const { code, stdout } = await run(ffprobePath, args)
  if (code !== 0) throw new Error(`ffprobe failed for ${filePath}`)

  const data = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string }
    streams?: Array<{
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      r_frame_rate?: string
      duration?: string
    }>
  }

  const streams = data.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video')
  const audio = streams.find((s) => s.codec_type === 'audio')
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0)

  let fps = 30
  if (video?.r_frame_rate) {
    const [a, b] = video.r_frame_rate.split('/').map(Number)
    if (a && b) fps = a / b
  }

  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
  let kind: ProbeResult['kind'] = 'video'
  if (imageExts.has(ext)) kind = 'image'
  else if (!video && audio) kind = 'audio'

  return {
    path: filePath,
    kind,
    duration: kind === 'image' ? 5 : duration || 0,
    width: video?.width ?? 1920,
    height: video?.height ?? 1080,
    fps,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video) || kind === 'image',
    codec: video?.codec_name ?? audio?.codec_name ?? '',
  }
}

/**
 * Build a Chromium-safe H.264/yuv420p proxy for realtime preview.
 * Phone footage (HEVC / 10-bit / HDR) often decodes as a black <video> frame.
 */
export async function ensurePreviewProxy(filePath: string): Promise<{ path: string }> {
  const dir = path.join(os.tmpdir(), 'vidit-proxies')
  fs.mkdirSync(dir, { recursive: true })
  let mtime = '0'
  try {
    mtime = String(fs.statSync(filePath).mtimeMs)
  } catch {
    /* ignore */
  }
  // v3: short GOP (~1s) so scrub/play doesn't hitch every ~8s on long keyframe intervals
  const key = createHash('sha1')
    .update(filePath)
    .update(mtime)
    .update('proxy-v3-gop1s')
    .digest('hex')
    .slice(0, 20)
  const out = path.join(dir, `${key}.mp4`)
  if (fs.existsSync(out) && fs.statSync(out).size > 1024) {
    return { path: out }
  }

  const args = [
    '-y',
    '-i',
    filePath,
    '-map',
    '0:v:0',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'baseline',
    '-level',
    '4.0',
    // Keyframe every ~1s — long GOPs make Chromium scrub/decode feel like a slowdown loop
    '-g',
    '30',
    '-keyint_min',
    '30',
    '-sc_threshold',
    '0',
    '-force_key_frames',
    'expr:gte(t,n_forced*1)',
    '-bf',
    '0',
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-movflags',
    '+faststart',
    out,
  ]
  const { code, stderr } = await run(ffmpegPath, args)
  if (code !== 0 || !fs.existsSync(out)) {
    throw new Error(`Preview proxy failed:\n${stderr.slice(-800)}`)
  }
  return { path: out }
}

export async function generateThumbnail(filePath: string): Promise<ThumbnailResult> {
  const out = path.join(
    os.tmpdir(),
    `vidit-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  )
  // Contact sheet filmstrip for timeline
  const args = [
    '-y',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-vf',
    'fps=1/2,scale=80:45:force_original_aspect_ratio=decrease,pad=80:45:(ow-iw)/2:(oh-ih)/2,tile=8x1',
    out,
  ]
  let { code } = await run(ffmpegPath, args)
  if (code !== 0 || !fs.existsSync(out)) {
    const single = [
      '-y',
      '-ss',
      '0.5',
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-1',
      out,
    ]
    ;({ code } = await run(ffmpegPath, single))
  }
  if (code !== 0 || !fs.existsSync(out)) {
    if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(filePath)) {
      return { path: filePath, dataUrl: pathToFileURL(filePath).href }
    }
    return { path: filePath, dataUrl: '' }
  }
  const buf = fs.readFileSync(out)
  fs.unlinkSync(out)
  return { path: filePath, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` }
}

export async function generateWaveform(filePath: string, samples = 200): Promise<WaveformResult> {
  const out = path.join(os.tmpdir(), `vidit-wave-${Date.now()}.raw`)
  const args = [
    '-y',
    '-i',
    filePath,
    '-ac',
    '1',
    '-filter:a',
    'aresample=8000',
    '-f',
    'f32le',
    out,
  ]
  const { code } = await run(ffmpegPath, args)
  if (code !== 0 || !fs.existsSync(out)) {
    return { path: filePath, peaks: Array.from({ length: samples }, () => 0.1) }
  }
  const buf = fs.readFileSync(out)
  fs.unlinkSync(out)
  const floats = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
  const peaks: number[] = []
  const block = Math.max(1, Math.floor(floats.length / samples))
  for (let i = 0; i < samples; i++) {
    let max = 0
    const start = i * block
    for (let j = start; j < start + block && j < floats.length; j++) {
      max = Math.max(max, Math.abs(floats[j] ?? 0))
    }
    peaks.push(Math.min(1, max))
  }
  return { path: filePath, peaks }
}

function parseTime(stderr: string): number | null {
  const match = /time=(\d+):(\d+):(\d+\.\d+)/.exec(stderr)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  const s = Number(match[3])
  return h * 3600 + m * 60 + s
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, '\\n')
}

/** drawtext color: `0xRRGGBB@A` */
function ffmpegDrawColor(color: string, alpha = 1): string {
  const raw = (color || '#ffffff').replace('#', '')
  let hex =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.slice(0, 6)
  if (hex.length < 6) hex = 'ffffff'
  const a = Math.max(0, Math.min(1, alpha))
  return `0x${hex.toUpperCase()}@${a.toFixed(3)}`
}

function buildExportArgs(plan: ExportPlan, previewPath: string): string[] {
  const args: string[] = ['-y']
  const videoClips = plan.clips.filter((c) => c.hasVideo)
  const audioClips = plan.clips.filter((c) => c.hasAudio)

  for (const clip of plan.clips) {
    args.push('-i', clip.path)
  }

  const filterParts: string[] = []
  const aLabels: string[] = []

  filterParts.push(
    `color=c=black:s=${plan.width}x${plan.height}:d=${Math.max(plan.duration, 0.1)}:r=${plan.fps}[base]`,
  )
  let current = 'base'

  videoClips.forEach((clip, i) => {
    const idx = plan.clips.indexOf(clip)
    const setpts = clip.reverse
      ? `reverse,setpts=PTS-STARTPTS,setpts=${(1 / clip.speed).toFixed(6)}*PTS`
      : `setpts=${(1 / clip.speed).toFixed(6)}*(PTS-STARTPTS)`

    const sx = Math.max(0.05, clip.scaleX ?? 1)
    const sy = Math.max(0.05, clip.scaleY ?? 1)
    const tw = Math.max(2, Math.round(plan.width * sx))
    const th = Math.max(2, Math.round(plan.height * sy))
    let vf = `[${idx}:v]trim=start=${clip.inPoint}:end=${clip.outPoint},${setpts},fps=${plan.fps},format=rgba`

    const cl = clip.cropL ?? 0
    const cr = clip.cropR ?? 0
    const ct = clip.cropT ?? 0
    const cb = clip.cropB ?? 0
    if (cl + cr + ct + cb > 0.001) {
      vf += `,crop=iw*(1-${cl}-${cr}):ih*(1-${ct}-${cb}):iw*${cl}:ih*${ct}`
    }

    vf += `,scale=${tw}:${th}:force_original_aspect_ratio=decrease`

    const rot = clip.rotation ?? 0
    if (Math.abs(rot) > 0.01) {
      vf += `,rotate=${((rot * Math.PI) / 180).toFixed(6)}:ow=rotw(${((rot * Math.PI) / 180).toFixed(6)}):oh=roth(${((rot * Math.PI) / 180).toFixed(6)}):c=none`
    }

    const opacity = Math.max(0, Math.min(1, clip.opacity ?? 1))
    if (opacity < 0.999) {
      vf += `,colorchannelmixer=aa=${opacity.toFixed(3)}`
    }

    vf += `,setpts=PTS-STARTPTS`

    if (clip.speed < 0.99) {
      vf += `,minterpolate=fps=${plan.fps}:mi_mode=blend`
    }

    const label = `v${i}`
    filterParts.push(`${vf}[${label}raw]`)
    filterParts.push(`[${label}raw]setpts=PTS-STARTPTS+${clip.start}/TB[${label}]`)
    const out = `vo${i}`
    const ox = `(main_w-overlay_w)/2+(${clip.x ?? 0.5}-0.5)*main_w`
    const oy = `(main_h-overlay_h)/2+(${clip.y ?? 0.5}-0.5)*main_h`
    const fade =
      clip.transitionIn > 0 ? `:alpha=premultiplied` : ''
    const fadeFilter =
      clip.transitionIn > 0 ? `,fade=t=in:st=${clip.start}:d=${clip.transitionIn}:alpha=1` : ''
    const topLabel = fadeFilter ? `${label}f` : label
    if (fadeFilter) {
      filterParts.push(`[${label}]format=rgba${fadeFilter}[${label}f]`)
    }
    const blend = getBlendMode(clip.blendMode)
    if (blend.ffmpeg === 'normal') {
      filterParts.push(
        `[${current}][${topLabel}]overlay=x='${ox}':y='${oy}':eof_action=pass${fade}[${out}]`,
      )
    } else {
      // Full-frame place, then blend in RGB so modes like multiply aren't green-tinted
      filterParts.push(
        `color=c=0x00000000:s=${plan.width}x${plan.height}:d=${Math.max(plan.duration, 0.1)}:r=${plan.fps},format=rgba[${label}pad]`,
      )
      filterParts.push(
        `[${label}pad][${topLabel}]overlay=x='${ox}':y='${oy}':eof_action=pass:format=auto[${label}placed]`,
      )
      filterParts.push(`[${current}]format=gbrap[${current}rgb]`)
      filterParts.push(`[${label}placed]format=gbrap[${label}rgb]`)
      filterParts.push(
        `[${current}rgb][${label}rgb]blend=all_mode=${blend.ffmpeg}:all_opacity=1[${out}pre]`,
      )
      filterParts.push(`[${out}pre]format=rgba[${out}]`)
    }
    current = out
  })

  let vOut = current

  plan.texts.forEach((t, i) => {
    const xExpr =
      t.align === 'left'
        ? `${Math.round(t.x * plan.width)}`
        : t.align === 'right'
          ? `w-tw-${Math.round((1 - t.x) * plan.width)}`
          : `(w-tw)/2`
    const yExpr =
      t.verticalAlign === 'top'
        ? `${Math.round(t.y * plan.height)}`
        : t.verticalAlign === 'bottom'
          ? `h-th-${Math.round((1 - t.y) * plan.height)}`
          : `(h-th)/2`
    const fontfile =
      process.platform === 'win32'
        ? 'C\\:/Windows/Fonts/arial.ttf'
        : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    const enable = `enable='between(t,${t.start},${t.start + t.duration})'`
    const core = `fontfile='${fontfile}':text='${escapeDrawtext(t.text)}':fontsize=${t.fontSize}:${enable}`
    const opacity = t.opacity ?? 1
    const fontcolor = ffmpegDrawColor(t.color, opacity)

    let extras = ''
    if (t.outlineEnabled && t.outlineWidth > 0) {
      extras += `:borderw=${t.outlineWidth}:bordercolor=${ffmpegDrawColor(t.outlineColor ?? '#000000', 1)}`
    }
    if (t.shadowEnabled) {
      extras += `:shadowx=${t.shadowOffsetX ?? 2}:shadowy=${t.shadowOffsetY ?? 2}:shadowcolor=${ffmpegDrawColor(t.shadowColor ?? '#000000', t.shadowOpacity ?? 0.65)}`
    }

    // Fake bevel: highlight + lowlight passes under the main fill
    if (t.bevelEnabled && (t.bevelDepth ?? 0) > 0) {
      const d = t.bevelDepth
      const hi = `vt${i}hi`
      const lo = `vt${i}lo`
      filterParts.push(
        `[${vOut}]drawtext=${core}:fontcolor=${ffmpegDrawColor('#ffffff', 0.45)}:x=${xExpr}-${d}:y=${yExpr}-${d}[${hi}]`,
      )
      filterParts.push(
        `[${hi}]drawtext=${core}:fontcolor=${ffmpegDrawColor('#000000', 0.45)}:x=${xExpr}+${d}:y=${yExpr}+${d}[${lo}]`,
      )
      vOut = lo
    }

    const next = `vt${i}`
    filterParts.push(
      `[${vOut}]drawtext=${core}:fontcolor=${fontcolor}:x=${xExpr}:y=${yExpr}${extras}[${next}]`,
    )
    vOut = next
  })

  audioClips.forEach((clip, i) => {
    const idx = plan.clips.indexOf(clip)
    let af = `[${idx}:a]atrim=start=${clip.inPoint}:end=${clip.outPoint},asetpts=PTS-STARTPTS`
    if (clip.reverse) af += `,areverse`
    let remaining = clip.speed
    const factors: number[] = []
    while (remaining > 2.01) {
      factors.push(2)
      remaining /= 2
    }
    while (remaining < 0.49) {
      factors.push(0.5)
      remaining *= 2
    }
    factors.push(Math.min(2, Math.max(0.5, remaining)))
    for (const f of factors) af += `,atempo=${f.toFixed(4)}`
    af += `,volume=${clip.volume}`
    if (clip.fadeIn > 0) af += `,afade=t=in:st=0:d=${clip.fadeIn}`
    if (clip.fadeOut > 0) {
      const dur = (clip.outPoint - clip.inPoint) / Math.max(clip.speed, 0.01)
      af += `,afade=t=out:st=${Math.max(0, dur - clip.fadeOut)}:d=${clip.fadeOut}`
    }
    af += `,adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[a${i}]`
    filterParts.push(af)
    aLabels.push(`a${i}`)
  })

  let aMap = ''
  if (aLabels.length === 0) {
    filterParts.push(`anullsrc=r=48000:cl=stereo:d=${Math.max(plan.duration, 0.1)}[aout]`)
    aMap = '[aout]'
  } else if (aLabels.length === 1) {
    aMap = `[${aLabels[0]}]`
  } else {
    filterParts.push(
      `${aLabels.map((l) => `[${l}]`).join('')}amix=inputs=${aLabels.length}:duration=longest:dropout_transition=0[aout]`,
    )
    aMap = '[aout]'
  }

  // Low-res side branch for the export dialog preview (does not affect the file)
  filterParts.push(`[${vOut}]split=2[venc][vprevsrc]`)
  filterParts.push(`[vprevsrc]fps=2,scale=480:-2:flags=fast_bilinear,format=yuvj420p[vprev]`)

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[venc]', '-map', aMap)
  args.push('-t', String(plan.duration))

  const rateControl = plan.rateControl === 'bitrate' ? 'bitrate' : 'crf'
  const audioKbps = Math.round(
    Math.min(512, Math.max(64, plan.audioBitrateKbps ?? 192)),
  )

  if (plan.codec === 'h264' || plan.codec === 'h265') {
    const encoder = plan.codec === 'h264' ? 'libx264' : 'libx265'
    const defaultCrf = plan.codec === 'h264' ? 18 : 20
    args.push('-c:v', encoder, '-preset', 'medium')
    if (rateControl === 'bitrate') {
      const kbps = Math.round(
        Math.min(
          200_000,
          Math.max(
            200,
            plan.videoBitrateKbps ??
              suggestVideoBitrateKbps(plan.width, plan.height, plan.fps),
          ),
        ),
      )
      // 2-pass-ish VBV: target + ~2× maxrate keeps size predictable without full 2-pass
      args.push('-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`)
    } else {
      const crf = Math.round(Math.min(40, Math.max(10, plan.crf ?? defaultCrf)))
      args.push('-crf', String(crf))
    }
    args.push('-pix_fmt', 'yuv420p')
    if (plan.codec === 'h265') args.push('-tag:v', 'hvc1')
  } else {
    args.push('-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le')
  }

  args.push('-c:a', 'aac', '-b:a', `${audioKbps}k`)

  if (plan.container === 'mov' || plan.codec === 'prores') {
    args.push('-f', 'mov')
  } else {
    args.push('-f', 'mp4', '-movflags', '+faststart')
  }

  args.push(plan.outputPath)

  // Overwrite a single JPEG as frames encode (~2 fps)
  args.push(
    '-map',
    '[vprev]',
    '-update',
    '1',
    '-q:v',
    '5',
    '-f',
    'image2',
    previewPath.replace(/\\/g, '/'),
  )
  return args
}

function readPreviewDataUrl(previewPath: string): string | undefined {
  try {
    if (!fs.existsSync(previewPath)) return undefined
    const buf = fs.readFileSync(previewPath)
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined
    if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return undefined
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}

export async function exportProject(
  plan: ExportPlan,
  onProgress: (p: ExportProgress) => void,
): Promise<void> {
  if (plan.codec === 'prores' && !plan.outputPath.toLowerCase().endsWith('.mov')) {
    plan.outputPath = plan.outputPath.replace(/\.[^.]+$/i, '.mov')
  }

  const previewPath = path.join(
    os.tmpdir(),
    `vidit-export-preview-${process.pid}-${Date.now()}.jpg`,
  )
  try {
    if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath)
  } catch {
    /* ignore */
  }

  const args = buildExportArgs(plan, previewPath)
  onProgress({ percent: 0, time: 0, message: 'Starting export…' })

  let lastPreviewAt = 0
  let lastPreviewUrl: string | undefined

  const emit = (partial: Omit<ExportProgress, 'previewDataUrl'> & { previewDataUrl?: string }) => {
    const now = Date.now()
    if (now - lastPreviewAt >= 280) {
      const url = readPreviewDataUrl(previewPath)
      if (url) {
        lastPreviewUrl = url
        lastPreviewAt = now
      }
    }
    onProgress({ ...partial, previewDataUrl: lastPreviewUrl })
  }

  const { code, stderr } = await run(ffmpegPath, args, (chunk) => {
    const t = parseTime(chunk)
    if (t != null && plan.duration > 0) {
      emit({
        percent: Math.min(99, (t / plan.duration) * 100),
        time: t,
        message: `Encoding ${t.toFixed(1)}s / ${plan.duration.toFixed(1)}s`,
      })
    }
  })

  try {
    if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath)
  } catch {
    /* ignore */
  }

  if (code !== 0) {
    throw new Error(`FFmpeg export failed:\n${stderr.slice(-2000)}`)
  }
  onProgress({
    percent: 100,
    time: plan.duration,
    message: 'Export complete',
    previewDataUrl: lastPreviewUrl,
  })
}

export async function createBakeDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `vidit-bake-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
}

export async function writeBakeFrame(
  dir: string,
  index: number,
  bytes: Uint8Array | number[],
): Promise<void> {
  const name = `frame_${String(index + 1).padStart(5, '0')}.png`
  const buf = Buffer.from(bytes)
  await fs.promises.writeFile(path.join(dir, name), buf)
}

/** Encode PNG sequence to MOV with alpha (PNG codec). */
export async function encodeBakeDir(dir: string, fps: number): Promise<string> {
  const out = path.join(dir, 'plate.mov')
  const pattern = path.join(dir, 'frame_%05d.png').replace(/\\/g, '/')
  const args = [
    '-y',
    '-framerate',
    String(fps),
    '-i',
    pattern,
    '-c:v',
    'png',
    '-pix_fmt',
    'rgba',
    out.replace(/\\/g, '/'),
  ]
  const { code, stderr } = await run(ffmpegPath, args)
  if (code !== 0) throw new Error(`Bake encode failed:\n${stderr.slice(-1500)}`)
  return out
}

export { ffmpegPath, ffprobePath }
