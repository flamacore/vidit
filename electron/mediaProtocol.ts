import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

function mimeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.aac':
    case '.m4a':
      return 'audio/mp4'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

export function decodeMediaPath(requestUrl: string): string {
  const url = new URL(requestUrl)
  const b64 = url.pathname.replace(/^\//, '')
  if (!b64) {
    return decodeURIComponent(url.searchParams.get('path') ?? '')
  }
  return Buffer.from(b64, 'base64url').toString('utf8')
}

/** Serve local media with Accept-Ranges / 206 so <video> can seek & scrub */
export async function handleMediaRequest(request: Request): Promise<Response> {
  const filePath = decodeMediaPath(request.url)
  if (!filePath || !fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  const stat = await fs.promises.stat(filePath)
  const fileSize = stat.size
  const mime = mimeFor(filePath)
  const range = request.headers.get('Range') || request.headers.get('range')

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range)
    if (m) {
      const start = Number(m[1])
      let end = m[2] ? Number(m[2]) : fileSize - 1
      if (Number.isNaN(start) || start >= fileSize) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        })
      }
      end = Math.min(end, fileSize - 1)
      const chunkSize = end - start + 1
      const nodeStream = fs.createReadStream(filePath, { start, end })
      const webStream = Readable.toWeb(nodeStream) as NodeReadableStream
      return new Response(webStream as unknown as Response['body'], {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  }

  const nodeStream = fs.createReadStream(filePath)
  const webStream = Readable.toWeb(nodeStream) as NodeReadableStream
  return new Response(webStream as unknown as Response['body'], {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
