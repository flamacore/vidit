import { useProjectStore } from '../../store/projectStore'
import type { ElementTransform } from '../../lib/elementTransform'
import { formatDuration } from '../../lib/timelineMath'
import type { ModelClip } from '../../types/project'
import { ModelMaterialEditor } from './ModelMaterialEditor'
import { ObjectTransformControls } from './ObjectTransformControls'
import { TextEditor } from './TextEditor'
import { TransformControls } from './TransformControls'

export function Inspector() {
  const selection = useProjectStore((s) => s.selection)
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds)
  const selectedTextIds = useProjectStore((s) => s.selectedTextIds)
  const selectedModelIds = useProjectStore((s) => s.selectedModelIds)
  const clips = useProjectStore((s) => s.clips)
  const textClips = useProjectStore((s) => s.textClips)
  const modelClips = useProjectStore((s) => s.modelClips)
  const assets = useProjectStore((s) => s.assets)
  const threeDEnabled = useProjectStore((s) => s.settings.threeDEnabled)
  const updateClip = useProjectStore((s) => s.updateClip)
  const updateClips = useProjectStore((s) => s.updateClips)
  const updateTexts = useProjectStore((s) => s.updateTexts)
  const updateModel = useProjectStore((s) => s.updateModel)
  const updateModels = useProjectStore((s) => s.updateModels)
  const addTextClip = useProjectStore((s) => s.addTextClip)

  const clip = selection.type === 'clip' ? clips.find((c) => c.id === selection.id) : undefined
  const text = selection.type === 'text' ? textClips.find((t) => t.id === selection.id) : undefined
  const model =
    selection.type === 'model' ? modelClips.find((m) => m.id === selection.id) : undefined
  const asset = clip
    ? assets.find((a) => a.id === clip.assetId)
    : model
      ? assets.find((a) => a.id === model.assetId)
      : undefined
  const clipTargets =
    selectedClipIds.length > 0 ? selectedClipIds : clip ? [clip.id] : []
  const textTargets =
    selectedTextIds.length > 0 ? selectedTextIds : text ? [text.id] : []
  const modelTargets =
    selectedModelIds.length > 0 ? selectedModelIds : model ? [model.id] : []
  const multiCount =
    selectedClipIds.length > 1
      ? selectedClipIds.length
      : selectedTextIds.length > 1
        ? selectedTextIds.length
        : selectedModelIds.length > 1
          ? selectedModelIds.length
          : 0

  const patchClipTransform = (patch: Partial<ElementTransform>) => {
    if (clipTargets.length > 1) updateClips(clipTargets, patch)
    else if (clip) updateClip(clip.id, patch)
  }

  const patchModel = (patch: Partial<ModelClip>) => {
    if (!model) return
    if (modelTargets.length > 1) updateModels(modelTargets, patch)
    else updateModel(model.id, patch)
  }

  return (
    <aside className="panel" data-testid="inspector">
      <div className="panel-header">
        <span>Inspector{multiCount ? ` · ${multiCount}` : ''}</span>
        <button type="button" className="btn btn-ghost" data-testid="add-text" onClick={() => addTextClip()}>
          + Text
        </button>
      </div>
      <div className="panel-body">
        {multiCount > 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 0 }}>
            {multiCount} items selected — editing primary. Drag moves all.
          </p>
        ) : null}
        {!clip && !text && !model ? (
          <div className="empty-hint">Select a clip or text on the timeline to edit properties.</div>
        ) : null}

        {clip ? (
          <>
            <div className="inspector-section">
              <h3>Clip</h3>
              <div className="field">
                <label>Name</label>
                <input type="text" value={asset?.name ?? ''} readOnly />
              </div>
              <div className="field">
                <label>Speed — {clip.speed.toFixed(2)}x</label>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={clip.speed}
                  onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })}
                />
              </div>
              <div className="row" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={`btn ${clip.reverse ? 'active' : ''}`}
                  onClick={() => updateClip(clip.id, { reverse: !clip.reverse })}
                >
                  Reverse
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateClip(clip.id, { speed: 1, reverse: false })}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="inspector-section">
              <h3>Audio</h3>
              <div className="field">
                <label>Volume — {Math.round(clip.volume * 100)}%</label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={clip.volume}
                  onChange={(e) => updateClip(clip.id, { volume: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Fade in — {clip.fadeIn.toFixed(2)}s</label>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={clip.fadeIn}
                  onChange={(e) => updateClip(clip.id, { fadeIn: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Fade out — {clip.fadeOut.toFixed(2)}s</label>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={clip.fadeOut}
                  onChange={(e) => updateClip(clip.id, { fadeOut: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="inspector-section">
              <h3>Transition</h3>
              <div className="field">
                <label>Crossfade in — {clip.transitionIn.toFixed(2)}s</label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={clip.transitionIn}
                  onChange={(e) => updateClip(clip.id, { transitionIn: Number(e.target.value) })}
                />
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: 11, margin: 0 }}>
                Dissolve from previous layer over this duration.
              </p>
            </div>

            <TransformControls
              title={clipTargets.length > 1 ? `Transform · ${clipTargets.length}` : 'Transform'}
              value={clip}
              onChange={patchClipTransform}
            />
          </>
        ) : null}

        {text ? (
          <>
            <TextEditor text={text} />
            <TransformControls
              title={textTargets.length > 1 ? `Transform · ${textTargets.length}` : 'Transform'}
              value={text}
              onChange={(patch) => {
                if (textTargets.length > 1) updateTexts(textTargets, patch)
                else updateTexts([text.id], patch)
              }}
            />
          </>
        ) : null}

        {model ? (
          <>
            {!threeDEnabled ? (
              <p style={{ color: 'var(--danger)', fontSize: 11 }}>
                3D is disabled for this sequence — enable it in sequence settings to preview/export.
              </p>
            ) : null}
            <div className="inspector-section">
              <h3>3D clip</h3>
              <div className="field">
                <label>Name</label>
                <input type="text" value={asset?.name ?? ''} readOnly />
              </div>
              <div className="field">
                <label>Duration</label>
                <input type="text" value={formatDuration(model.duration)} readOnly />
              </div>
            </div>
            <ObjectTransformControls value={model} onChange={patchModel} />
            <TransformControls
              title={
                modelTargets.length > 1
                  ? `Frame transform · ${modelTargets.length}`
                  : 'Frame transform'
              }
              value={model}
              onChange={patchModel}
            />
            <ModelMaterialEditor clip={model} assets={assets} onChange={patchModel} />
          </>
        ) : null}
      </div>
    </aside>
  )
}
