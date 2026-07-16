import { useEffect, useRef, useState } from 'react'
import { transformStyle, withTransform } from '../../lib/elementTransform'
import { getPreviewBlobUrl, peekPreviewBlobUrl } from '../../lib/previewBlobCache'
import type { MediaAsset, TimelineClip } from '../../types/project'

function srcTime(clip: TimelineClip, timelineTime: number): number {
  const local = (timelineTime - clip.start) * clip.speed
  const t = clip.reverse ? clip.outPoint - local : clip.inPoint + local
  return Math.max(0, t)
}

interface Props {
  clip: TimelineClip
  asset: MediaAsset
  timelineTime: number
  isPlaying: boolean
  /** When false, layer stays mounted but is hidden/paused (avoids remount jank). */
  active: boolean
  zIndex: number
  /** Transition / visibility opacity (0–1), multiplied with clip.opacity */
  opacity: number
  /** When true, this layer is the preview audio source */
  playAudio?: boolean
  audioSinkId?: string
  onStatus?: (msg: string) => void
}

/**
 * Realtime layer: during forward play the <video> is the clock (no per-frame seeks).
 * Scrub / reverse seek only when paused or reversing.
 */
export function PreviewLayer({
  clip,
  asset,
  timelineTime,
  isPlaying,
  active,
  zIndex,
  opacity,
  playAudio = false,
  audioSinkId = '',
  onStatus,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readyRef = useRef(false)
  const playingRef = useRef(false)
  const timeRef = useRef(timelineTime)
  const clipRef = useRef(clip)
  const activeRef = useRef(active)
  const statusRef = useRef(onStatus)
  timeRef.current = timelineTime
  clipRef.current = clip
  activeRef.current = active
  statusRef.current = onStatus

  const mediaPath = asset.proxyPath || asset.path
  const waitingProxy = asset.hasVideo && asset.kind !== 'image' && !asset.proxyPath
  const proxyFailed = asset.proxyStatus === 'error'
  const [src, setSrc] = useState(() =>
    asset.proxyPath ? (peekPreviewBlobUrl(asset.proxyPath) ?? '') : '',
  )

  useEffect(() => {
    let cancelled = false
    if (waitingProxy || asset.kind === 'image' || !mediaPath) {
      setSrc('')
      return
    }

    if (!asset.proxyPath) {
      setSrc(window.vidit?.toMediaUrl(mediaPath) ?? '')
      return
    }

    const cached = peekPreviewBlobUrl(asset.proxyPath)
    if (cached) {
      setSrc(cached)
      return
    }

    statusRef.current?.('Loading preview…')
    void getPreviewBlobUrl(asset.proxyPath)
      .then((url) => {
        if (!cancelled) {
          setSrc(url)
          statusRef.current?.('')
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('blob preview failed', err)
        setSrc(window.vidit?.toMediaUrl(mediaPath) ?? '')
        statusRef.current?.('')
      })

    return () => {
      cancelled = true
    }
  }, [mediaPath, asset.proxyPath, waitingProxy, asset.kind])

  useEffect(() => {
    if (!active) return
    if (waitingProxy) statusRef.current?.(`Building preview for ${asset.name}…`)
    else if (proxyFailed) statusRef.current?.(`Preview proxy failed: ${asset.name}`)
  }, [waitingProxy, proxyFailed, asset.name, active])

  useEffect(() => {
    const video = videoRef.current
    if (!video || asset.kind === 'image' || !src) return

    readyRef.current = false
    const onReady = () => {
      readyRef.current = true
      try {
        video.currentTime = srcTime(clipRef.current, timeRef.current)
      } catch {
        /* ignore */
      }
      if (activeRef.current) {
        statusRef.current?.(video.videoWidth ? '' : `${asset.name}: no frames`)
      }
    }
    const onErr = () => {
      if (!activeRef.current) return
      const code = video.error?.code
      statusRef.current?.(
        `${asset.name}: ${
          code === 3 ? 'decode error' : code === 4 ? 'format not supported' : 'failed to load'
        }`,
      )
    }

    video.addEventListener('loadeddata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('error', onErr)
    if (video.readyState >= 2) onReady()

    return () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onErr)
    }
  }, [src, asset.name, asset.kind])

  // Start/stop native playback — NOT tied to playhead ticks
  useEffect(() => {
    const video = videoRef.current
    if (!video || asset.kind === 'image' || !src) return

    if (!active) {
      playingRef.current = false
      if (!video.paused) video.pause()
      return
    }

    const forwardPlay = isPlaying && !clip.reverse
    if (forwardPlay) {
      video.playbackRate = Math.min(16, Math.max(0.0625, clip.speed))
      if (!playingRef.current && (readyRef.current || video.readyState >= 1)) {
        const target = srcTime(clipRef.current, timeRef.current)
        if (Math.abs(video.currentTime - target) > 0.05) {
          try {
            video.currentTime = target
          } catch {
            /* ignore */
          }
        }
      }
      playingRef.current = true
      void video.play().catch((err: unknown) => {
        playingRef.current = false
        statusRef.current?.(err instanceof Error ? err.message : 'Playback blocked')
      })
      return
    }

    playingRef.current = false
    if (!video.paused) video.pause()
  }, [isPlaying, active, src, asset.kind, clip.reverse, clip.speed])

  // Scrub only while paused (or reverse handled separately)
  useEffect(() => {
    const video = videoRef.current
    if (!video || asset.kind === 'image' || !src || !active) return
    if (isPlaying && !clip.reverse) return

    const target = srcTime(clip, timelineTime)
    if ((readyRef.current || video.readyState >= 1) && Math.abs(video.currentTime - target) > 0.03) {
      try {
        video.currentTime = target
      } catch {
        /* ignore */
      }
    }
  }, [
    timelineTime,
    isPlaying,
    active,
    src,
    asset.kind,
    clip.start,
    clip.speed,
    clip.reverse,
    clip.inPoint,
    clip.outPoint,
  ])

  // Occasional drift correction while playing (not every frame)
  useEffect(() => {
    if (!active || !isPlaying || clip.reverse) return
    const id = window.setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 1) return
      const target = srcTime(clipRef.current, timeRef.current)
      if (Math.abs(video.currentTime - target) > 0.5) {
        try {
          video.currentTime = target
        } catch {
          /* ignore */
        }
      }
    }, 300)
    return () => clearInterval(id)
  }, [active, isPlaying, clip.reverse])

  // Reverse: step by seeking
  useEffect(() => {
    if (!active || !isPlaying || !clip.reverse) return
    const video = videoRef.current
    if (!video || !src) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      try {
        video.currentTime = Math.max(0, video.currentTime - dt * clip.speed)
      } catch {
        /* ignore */
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, isPlaying, clip.reverse, clip.speed, src])

  const xform = transformStyle(withTransform(clip))
  const vis = active ? opacity * xform.opacity : 0

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !playAudio || !active
    video.volume = Math.min(1, Math.max(0, clip.volume))
    const el = video as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }
    if (audioSinkId && el.setSinkId) {
      void el.setSinkId(audioSinkId).catch(() => undefined)
    }
  }, [playAudio, active, clip.volume, audioSinkId, src])

  if (asset.kind === 'image') {
    const imageSrc = window.vidit?.toMediaUrl(asset.path) ?? ''
    return (
      <div className="preview-layer-slot" style={{ zIndex, opacity: vis }}>
        <div className="preview-layer-xform" style={{ left: xform.left, top: xform.top, transform: xform.transform }}>
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className="preview-layer-media"
            data-vidit-layer={`clip:${clip.id}`}
            style={{ clipPath: xform.clipPath }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="preview-layer-slot" style={{ zIndex: zIndex + 1, opacity: vis }}>
      {asset.thumbnail && (waitingProxy || !src) ? (
        <div className="preview-layer-xform" style={{ left: xform.left, top: xform.top, transform: xform.transform }}>
          <img
            src={asset.thumbnail}
            alt=""
            draggable={false}
            className="preview-layer-media preview-layer-poster"
            data-vidit-layer={`clip:${clip.id}`}
            style={{ clipPath: xform.clipPath }}
          />
        </div>
      ) : null}
      {src && !waitingProxy ? (
        <div className="preview-layer-xform" style={{ left: xform.left, top: xform.top, transform: xform.transform }}>
          <video
            ref={videoRef}
            src={src}
            className="preview-layer-media"
            data-vidit-layer={`clip:${clip.id}`}
            style={{ clipPath: xform.clipPath }}
            muted={!playAudio}
            playsInline
            preload="auto"
            disablePictureInPicture
          />
        </div>
      ) : null}
    </div>
  )
}
