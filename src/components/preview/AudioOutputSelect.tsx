import { Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getStoredAudioOutputId,
  listAudioOutputDevices,
  setStoredAudioOutputId,
} from '../../lib/audioOutput'

interface Props {
  value: string
  onChange: (deviceId: string) => void
}

export function AudioOutputSelect({ value, onChange }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    void listAudioOutputDevices().then(setDevices)
    const onChangeDev = () => void listAudioOutputDevices().then(setDevices)
    navigator.mediaDevices?.addEventListener?.('devicechange', onChangeDev)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChangeDev)
  }, [])

  return (
    <label className="audio-output-select" title="Output audio device">
      <Volume2 size={14} />
      <select
        value={value}
        data-testid="audio-output"
        onChange={(e) => {
          const id = e.target.value
          setStoredAudioOutputId(id)
          onChange(id)
        }}
      >
        <option value="">System default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Output ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </label>
  )
}

export function useAudioOutputId(): [string, (id: string) => void] {
  const [id, setId] = useState(getStoredAudioOutputId)
  return [id, setId]
}
