/**
 * Shared Web Audio graph for preview: media element → gain → analyser → output.
 * Levels reflect decoded preview audio even when the OS/soundcard is muted.
 */

type LevelListener = (level: number, peak: number) => void

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let analyser: AnalyserNode | null = null
/** One MediaElementSource per element (Web Audio allows only one lifetime). */
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
let activeEl: HTMLMediaElement | null = null
const listeners = new Set<LevelListener>()
let raf = 0
let peakHold = 0
let peakDecayAt = 0

const data = new Uint8Array(2048)

function ensureGraph(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    masterGain = ctx.createGain()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.7
    masterGain.connect(analyser)
    analyser.connect(ctx.destination)
  }
  return ctx
}

function tickLevels() {
  raf = 0
  if (!analyser || listeners.size === 0) {
    return
  }
  analyser.getByteTimeDomainData(data)
  let sum = 0
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const v = ((data[i] ?? 128) - 128) / 128
    sum += v * v
    peak = Math.max(peak, Math.abs(v))
  }
  const rms = Math.sqrt(sum / data.length)
  const now = performance.now()
  if (peak >= peakHold || now > peakDecayAt) {
    peakHold = peak
    peakDecayAt = now + 800
  } else {
    peakHold *= 0.96
  }
  for (const fn of listeners) fn(rms, peakHold)
  raf = requestAnimationFrame(tickLevels)
}

function startMeter() {
  if (raf || listeners.size === 0) return
  raf = requestAnimationFrame(tickLevels)
}

function stopMeter() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  peakHold = 0
  for (const fn of listeners) fn(0, 0)
}

export async function resumePreviewAudio(): Promise<void> {
  const ac = ensureGraph()
  if (ac.state === 'suspended') await ac.resume().catch(() => undefined)
}

function sourceFor(el: HTMLMediaElement, ac: AudioContext): MediaElementAudioSourceNode | null {
  let src = sources.get(el)
  if (src) return src
  try {
    src = ac.createMediaElementSource(el)
    sources.set(el, src)
    return src
  } catch {
    return null
  }
}

/** Route a media element's audio through the master bus (replaces any previous source). */
export async function attachPreviewMedia(
  el: HTMLMediaElement,
  volume = 1,
): Promise<void> {
  const ac = ensureGraph()
  await resumePreviewAudio()
  const src = sourceFor(el, ac)
  if (!src || !masterGain) return

  if (activeEl && activeEl !== el) {
    const prev = sources.get(activeEl)
    try {
      prev?.disconnect()
    } catch {
      /* ignore */
    }
  }

  // Element output is taken over by the graph; keep unmuted so the source has signal.
  el.muted = false
  el.volume = 1
  try {
    src.disconnect()
  } catch {
    /* ignore */
  }
  src.connect(masterGain)
  activeEl = el
  masterGain.gain.value = Math.max(0, Math.min(1, volume))
  startMeter()
}

export function setPreviewMasterVolume(volume: number): void {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, volume))
}

export function detachPreviewMedia(el?: HTMLMediaElement): void {
  if (el && activeEl && el !== activeEl) return
  if (activeEl) {
    const src = sources.get(activeEl)
    try {
      src?.disconnect()
    } catch {
      /* ignore */
    }
  }
  activeEl = null
  stopMeter()
}

export async function setPreviewAudioSink(deviceId: string): Promise<void> {
  const ac = ensureGraph() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  if (typeof ac.setSinkId === 'function') {
    await ac.setSinkId(deviceId || '').catch(() => undefined)
  }
}

export function subscribePreviewLevels(fn: LevelListener): () => void {
  listeners.add(fn)
  ensureGraph()
  startMeter()
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) stopMeter()
  }
}
