import type { TextClip } from '../types/project'
import { withTextDefaults, buildPreviewTextShadow, colorWithAlpha } from './textStyle'
import { withTransform } from './elementTransform'

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode PNG frame'))
          return
        }
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject)
      },
      'image/png',
    )
  })
}

/** Bake a text clip to a transparent full-frame MOV for mid-stack export. */
export async function bakeTextClip(opts: {
  clip: TextClip
  width: number
  height: number
  fps: number
}): Promise<string> {
  if (!window.vidit?.createBakeDir || !window.vidit.writeBakeFrame || !window.vidit.encodeBakeDir) {
    throw new Error('Bake API missing')
  }
  const text = withTextDefaults(opts.clip)
  const xform = withTransform(text)
  const frameCount = Math.max(1, Math.round(opts.clip.duration * opts.fps))
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')

  const { dir } = await window.vidit.createBakeDir()
  for (let i = 0; i < frameCount; i++) {
    ctx.clearRect(0, 0, opts.width, opts.height)
    ctx.save()
    ctx.translate(opts.width * xform.x, opts.height * xform.y)
    ctx.rotate((xform.rotation * Math.PI) / 180)
    ctx.scale(xform.scaleX, xform.scaleY)
    ctx.globalAlpha = xform.opacity * text.opacity
    ctx.font = `${text.italic ? 'italic ' : ''}${text.bold ? '700 ' : '400 '}${text.fontSize}px ${text.fontFamily}, sans-serif`
    ctx.textAlign = text.align
    ctx.textBaseline =
      text.verticalAlign === 'top' ? 'top' : text.verticalAlign === 'bottom' ? 'bottom' : 'middle'
    ctx.fillStyle = colorWithAlpha(text.color, 1)
    if (text.outlineEnabled && text.outlineWidth > 0) {
      ctx.lineWidth = text.outlineWidth * 2
      ctx.strokeStyle = text.outlineColor
      ctx.strokeText(text.text, 0, 0)
    }
    const shadow = buildPreviewTextShadow(text)
    if (shadow) ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.fillText(text.text, 0, 0)
    ctx.restore()
    const bytes = await canvasToPngBytes(canvas)
    await window.vidit.writeBakeFrame(dir, i, bytes)
  }
  const { path } = await window.vidit.encodeBakeDir(dir, opts.fps)
  return path
}
