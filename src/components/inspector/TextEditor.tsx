import { AlignCenter, AlignLeft, AlignRight, Type } from 'lucide-react'
import { DEFAULT_TEXT_STYLE, withTextDefaults } from '../../lib/textStyle'
import { useProjectStore } from '../../store/projectStore'
import type { TextClip } from '../../types/project'

const FONTS = [
  'Segoe UI',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Inter',
]

interface Props {
  text: TextClip
}

export function TextEditor({ text: raw }: Props) {
  const updateText = useProjectStore((s) => s.updateText)
  const text = withTextDefaults(raw)
  const patch = (p: Partial<TextClip>) => updateText(text.id, p)

  return (
    <div className="inspector-section">
      <h3>
        <Type size={12} style={{ marginRight: 6, verticalAlign: -1 }} />
        Text
      </h3>
      <div className="field">
        <label>Content</label>
        <textarea rows={3} value={text.text} onChange={(e) => patch({ text: e.target.value })} />
      </div>
      <div className="field">
        <label>Font</label>
        <select value={text.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Size — {text.fontSize}px</label>
        <input
          type="range"
          min={12}
          max={200}
          value={text.fontSize}
          onChange={(e) => patch({ fontSize: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Color</label>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input
            type="color"
            value={text.color.length >= 7 ? text.color.slice(0, 7) : text.color}
            onChange={(e) => patch({ color: e.target.value })}
            style={{ width: 44, height: 32, padding: 0 }}
          />
          <input
            type="text"
            value={text.color}
            onChange={(e) => patch({ color: e.target.value })}
            style={{ flex: 1, minWidth: 0 }}
          />
        </div>
      </div>
      <div className="field">
        <label>Opacity — {Math.round(text.opacity * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={text.opacity}
          onChange={(e) => patch({ opacity: Number(e.target.value) })}
        />
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button type="button" className={`btn ${text.bold ? 'active' : ''}`} onClick={() => patch({ bold: !text.bold })}>
          B
        </button>
        <button
          type="button"
          className={`btn ${text.italic ? 'active' : ''}`}
          onClick={() => patch({ italic: !text.italic })}
        >
          I
        </button>
        <button
          type="button"
          className={`btn ${text.align === 'left' ? 'active' : ''}`}
          onClick={() => patch({ align: 'left', x: 0.08 })}
        >
          <AlignLeft size={14} />
        </button>
        <button
          type="button"
          className={`btn ${text.align === 'center' ? 'active' : ''}`}
          onClick={() => patch({ align: 'center', x: 0.5 })}
        >
          <AlignCenter size={14} />
        </button>
        <button
          type="button"
          className={`btn ${text.align === 'right' ? 'active' : ''}`}
          onClick={() => patch({ align: 'right', x: 0.92 })}
        >
          <AlignRight size={14} />
        </button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`btn ${text.verticalAlign === 'top' ? 'active' : ''}`}
          onClick={() => patch({ verticalAlign: 'top', y: 0.12 })}
        >
          Top
        </button>
        <button
          type="button"
          className={`btn ${text.verticalAlign === 'middle' ? 'active' : ''}`}
          onClick={() => patch({ verticalAlign: 'middle', y: 0.5 })}
        >
          Middle
        </button>
        <button
          type="button"
          className={`btn ${text.verticalAlign === 'bottom' ? 'active' : ''}`}
          onClick={() => patch({ verticalAlign: 'bottom', y: 0.88 })}
        >
          Bottom
        </button>
      </div>

      <h3 style={{ marginTop: 16 }}>Outline</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`btn ${text.outlineEnabled ? 'active' : ''}`}
          onClick={() => patch({ outlineEnabled: !text.outlineEnabled })}
        >
          {text.outlineEnabled ? 'On' : 'Off'}
        </button>
      </div>
      {text.outlineEnabled ? (
        <>
          <div className="field">
            <label>Outline color</label>
            <input
              type="color"
              value={text.outlineColor.slice(0, 7)}
              onChange={(e) => patch({ outlineColor: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Outline width — {text.outlineWidth}px</label>
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={text.outlineWidth}
              onChange={(e) => patch({ outlineWidth: Number(e.target.value) })}
            />
          </div>
        </>
      ) : null}

      <h3 style={{ marginTop: 16 }}>Drop shadow</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`btn ${text.shadowEnabled ? 'active' : ''}`}
          onClick={() => patch({ shadowEnabled: !text.shadowEnabled })}
        >
          {text.shadowEnabled ? 'On' : 'Off'}
        </button>
      </div>
      {text.shadowEnabled ? (
        <>
          <div className="field">
            <label>Shadow color</label>
            <input
              type="color"
              value={text.shadowColor.slice(0, 7)}
              onChange={(e) => patch({ shadowColor: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Shadow opacity — {Math.round(text.shadowOpacity * 100)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={text.shadowOpacity}
              onChange={(e) => patch({ shadowOpacity: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Blur — {text.shadowBlur}px</label>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={text.shadowBlur}
              onChange={(e) => patch({ shadowBlur: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Offset X — {text.shadowOffsetX}px</label>
            <input
              type="range"
              min={-40}
              max={40}
              step={1}
              value={text.shadowOffsetX}
              onChange={(e) => patch({ shadowOffsetX: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Offset Y — {text.shadowOffsetY}px</label>
            <input
              type="range"
              min={-40}
              max={40}
              step={1}
              value={text.shadowOffsetY}
              onChange={(e) => patch({ shadowOffsetY: Number(e.target.value) })}
            />
          </div>
        </>
      ) : null}

      <h3 style={{ marginTop: 16 }}>Bevel (fake 3D)</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`btn ${text.bevelEnabled ? 'active' : ''}`}
          onClick={() => patch({ bevelEnabled: !text.bevelEnabled })}
        >
          {text.bevelEnabled ? 'On' : 'Off'}
        </button>
      </div>
      {text.bevelEnabled ? (
        <div className="field">
          <label>Depth — {text.bevelDepth}px</label>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={text.bevelDepth}
            onChange={(e) => patch({ bevelDepth: Number(e.target.value) })}
          />
        </div>
      ) : null}

      <button
        type="button"
        className="btn"
        style={{ width: '100%', marginTop: 12 }}
        onClick={() =>
          patch({
            align: 'center',
            verticalAlign: 'middle',
            x: 0.5,
            y: 0.5,
            fontSize: 72,
            ...DEFAULT_TEXT_STYLE,
            color: text.color,
          })
        }
      >
        Auto center & fit
      </button>
    </div>
  )
}
