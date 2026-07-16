const KEY = 'vidit.audioOutputId'

export function getStoredAudioOutputId(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setStoredAudioOutputId(id: string): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export async function listAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    // Prompt once so labels are available
    await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      s.getTracks().forEach((t) => t.stop())
    })
  } catch {
    /* may still list devices without labels */
  }
  const all = await navigator.mediaDevices.enumerateDevices()
  return all.filter((d) => d.kind === 'audiooutput')
}
