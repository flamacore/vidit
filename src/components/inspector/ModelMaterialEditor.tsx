import { useMemo } from 'react'
import { defaultTextureSlot, scanSampler2DUniforms } from '../../lib/model3d'
import type {
  MediaAsset,
  ModelClip,
  ModelMaterial,
  PbrMaps,
  TextureChannel,
  TextureSlot,
} from '../../types/project'

const CHANNELS: TextureChannel[] = ['r', 'g', 'b', 'a']
const IMAGE_EXTS = /\.(png|jpe?g|webp|gif|bmp|tga|tiff?)$/i

interface Props {
  clip: ModelClip
  assets: MediaAsset[]
  onChange: (patch: Partial<ModelClip>) => void
}

function imageAssets(assets: MediaAsset[]): MediaAsset[] {
  return assets.filter((a) => a.kind === 'image')
}

function slotLabel(slot: TextureSlot | undefined, images: MediaAsset[]): string {
  if (!slot) return 'Embedded (model)'
  if (slot.path) {
    const name = slot.path.replace(/\\/g, '/').split('/').pop() ?? slot.path
    return `File · ${name}`
  }
  if (slot.assetId) {
    const a = images.find((i) => i.id === slot.assetId)
    return a ? `Bin · ${a.name}` : 'Bin texture'
  }
  return 'Embedded (model)'
}

async function pickImagePath(): Promise<string | null> {
  if (!window.vidit?.selectMediaFiles) return null
  const paths = await window.vidit.selectMediaFiles()
  const img = paths.find((p) => IMAGE_EXTS.test(p))
  return img ?? null
}

function TexturePicker({
  label,
  slot,
  images,
  onChange,
  showChannels,
}: {
  label: string
  slot?: TextureSlot
  images: MediaAsset[]
  onChange: (slot: TextureSlot | undefined) => void
  showChannels?: ('metallic' | 'roughness' | 'ao')[]
}) {
  const s = slot ?? defaultTextureSlot()
  const selectValue = s.path ? `__path__:${s.path}` : (s.assetId ?? '')

  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          style={{ flex: 1, minWidth: 120 }}
          value={selectValue.startsWith('__path__:') ? '__path__' : selectValue}
          onChange={(e) => {
            const v = e.target.value
            if (!v) onChange(undefined)
            else if (v === '__path__') {
              // Keep existing path; Browse sets a new one
              if (s.path) onChange({ ...s, assetId: undefined, path: s.path })
            } else onChange({ ...s, assetId: v, path: undefined })
          }}
        >
          <option value="">Embedded (model)</option>
          {s.path ? <option value="__path__">{slotLabel(s, images)}</option> : null}
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              Bin · {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void pickImagePath().then((path) => {
              if (!path) return
              onChange({ ...s, path, assetId: undefined })
            })
          }}
        >
          Browse…
        </button>
      </div>
      <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 2 }}>
        {slotLabel(slot, images)}
      </div>
      {showChannels?.includes('metallic') ? (
        <label className="row" style={{ gap: 6, marginTop: 4, fontSize: 11 }}>
          Metal channel
          <select
            value={s.metallicChannel ?? 'r'}
            onChange={(e) =>
              onChange({ ...s, metallicChannel: e.target.value as TextureChannel })
            }
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showChannels?.includes('roughness') ? (
        <label className="row" style={{ gap: 6, marginTop: 4, fontSize: 11 }}>
          Rough channel
          <select
            value={s.roughnessChannel ?? 'g'}
            onChange={(e) =>
              onChange({ ...s, roughnessChannel: e.target.value as TextureChannel })
            }
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showChannels?.includes('ao') ? (
        <label className="row" style={{ gap: 6, marginTop: 4, fontSize: 11 }}>
          AO channel
          <select
            value={s.aoChannel ?? 'r'}
            onChange={(e) => onChange({ ...s, aoChannel: e.target.value as TextureChannel })}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}

export function ModelMaterialEditor({ clip, assets, onChange }: Props) {
  const images = useMemo(() => imageAssets(assets), [assets])
  const material = clip.material

  const setMaterial = (next: ModelMaterial) => onChange({ material: next })

  const setPbr = (key: keyof PbrMaps, slot: TextureSlot | undefined) => {
    if (material.mode !== 'pbr') return
    const pbr = { ...material.pbr }
    if (slot && (slot.assetId || slot.path)) pbr[key] = slot
    else delete pbr[key]
    setMaterial({ mode: 'pbr', pbr })
  }

  const samplers =
    material.mode === 'custom' ? scanSampler2DUniforms(material.fragmentShader) : []

  return (
    <div className="inspector-section">
      <h3>Shading</h3>
      <label className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={clip.castShadows}
          onChange={(e) => onChange({ castShadows: e.target.checked })}
        />
        Cast shadows
      </label>
      <div className="field">
        <label>Mode</label>
        <select
          value={material.mode}
          onChange={(e) => {
            const mode = e.target.value as 'pbr' | 'custom'
            if (mode === 'pbr') setMaterial({ mode: 'pbr', pbr: {} })
            else
              setMaterial({
                mode: 'custom',
                fragmentShader:
                  'uniform sampler2D map;\nvarying vec2 vUv;\nvoid main() {\n  gl_FragColor = texture2D(map, vUv);\n}\n',
                textures: {},
              })
          }}
        >
          <option value="pbr">PBR</option>
          <option value="custom">Custom GLSL</option>
        </select>
      </div>

      {material.mode === 'pbr' ? (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 0 }}>
            Leave a slot on Embedded to keep the FBX texture. Browse or pick from the media bin to
            override only that map.
          </p>
          <TexturePicker
            label="Albedo"
            slot={material.pbr.albedo}
            images={images}
            onChange={(s) => setPbr('albedo', s)}
          />
          <TexturePicker
            label="Normal"
            slot={material.pbr.normal}
            images={images}
            onChange={(s) => setPbr('normal', s)}
          />
          <TexturePicker
            label="Metallic-Roughness (packed)"
            slot={material.pbr.metallicRoughness}
            images={images}
            showChannels={['metallic', 'roughness']}
            onChange={(s) => setPbr('metallicRoughness', s)}
          />
          <TexturePicker
            label="Metallic (separate)"
            slot={material.pbr.metallic}
            images={images}
            showChannels={['metallic']}
            onChange={(s) => setPbr('metallic', s)}
          />
          <TexturePicker
            label="Roughness (separate)"
            slot={material.pbr.roughness}
            images={images}
            showChannels={['roughness']}
            onChange={(s) => setPbr('roughness', s)}
          />
          <TexturePicker
            label="AO"
            slot={material.pbr.ao}
            images={images}
            showChannels={['ao']}
            onChange={(s) => setPbr('ao', s)}
          />
          <TexturePicker
            label="Emissive"
            slot={material.pbr.emissive}
            images={images}
            onChange={(s) => setPbr('emissive', s)}
          />
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 0 }}>
            Custom shaders are unlit. Texture uniforms (`sampler2D`) are scanned and exposed below.
          </p>
          <div className="field">
            <label>Vertex shader (optional)</label>
            <textarea
              rows={4}
              value={material.vertexShader ?? ''}
              onChange={(e) =>
                setMaterial({ ...material, vertexShader: e.target.value || undefined })
              }
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
          </div>
          <div className="field">
            <label>Fragment shader</label>
            <textarea
              rows={8}
              value={material.fragmentShader}
              onChange={(e) => setMaterial({ ...material, fragmentShader: e.target.value })}
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
          </div>
          {samplers.map((name) => (
            <div className="field" key={name}>
              <label>Texture · {name}</label>
              <div className="row" style={{ gap: 6 }}>
                <select
                  style={{ flex: 1 }}
                  value={material.textures[name] ?? ''}
                  onChange={(e) => {
                    const textures = { ...material.textures }
                    if (e.target.value) textures[name] = e.target.value
                    else delete textures[name]
                    setMaterial({ ...material, textures })
                  }}
                >
                  <option value="">None</option>
                  {images.map((a) => (
                    <option key={a.id} value={a.id}>
                      Bin · {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void pickImagePath().then((path) => {
                      if (!path) return
                      setMaterial({
                        ...material,
                        textures: { ...material.textures, [name]: path },
                      })
                    })
                  }}
                >
                  Browse…
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
