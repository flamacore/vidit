/**
 * Photoshop-style blend modes for timeline tracks.
 * Preview uses CSS mix-blend-mode (closest match); export uses FFmpeg blend all_mode.
 */

export type BlendModeId =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'dodge'
  | 'burn'
  | 'linear-dodge'
  | 'linear-burn'
  | 'negation'
  | 'addition'
  | 'subtract'
  | 'divide'
  | 'average'
  | 'grain-merge'
  | 'grain-extract'
  | 'hard-mix'
  | 'linear-light'
  | 'vivid-light'
  | 'pin-light'
  | 'hard-overlay'
  | 'phoenix'
  | 'reflect'
  | 'glow'
  | 'freeze'
  | 'heat'
  | 'bleach'
  | 'stain'
  | 'soft-difference'
  | 'geometric'
  | 'harmonic'
  | 'extremity'
  | 'interpolate'
  | 'xor'
  | 'and'
  | 'or'
  | 'multiply128'

export interface BlendModeDef {
  id: BlendModeId
  label: string
  group: string
  /** CSS mix-blend-mode (approximation when no 1:1) */
  css: string
  /** FFmpeg blend filter all_mode */
  ffmpeg: string
}

export const BLEND_MODES: BlendModeDef[] = [
  // —— Normal ——
  { id: 'normal', label: 'Normal', group: 'Normal', css: 'normal', ffmpeg: 'normal' },

  // —— Darken ——
  { id: 'darken', label: 'Darken', group: 'Darken', css: 'darken', ffmpeg: 'darken' },
  { id: 'multiply', label: 'Multiply', group: 'Darken', css: 'multiply', ffmpeg: 'multiply' },
  { id: 'color-burn', label: 'Color Burn', group: 'Darken', css: 'color-burn', ffmpeg: 'burn' },
  { id: 'burn', label: 'Burn', group: 'Darken', css: 'color-burn', ffmpeg: 'burn' },
  { id: 'linear-burn', label: 'Linear Burn', group: 'Darken', css: 'multiply', ffmpeg: 'subtract' },
  { id: 'stain', label: 'Stain', group: 'Darken', css: 'multiply', ffmpeg: 'stain' },
  { id: 'freeze', label: 'Freeze', group: 'Darken', css: 'multiply', ffmpeg: 'freeze' },

  // —— Lighten ——
  { id: 'lighten', label: 'Lighten', group: 'Lighten', css: 'lighten', ffmpeg: 'lighten' },
  { id: 'screen', label: 'Screen', group: 'Lighten', css: 'screen', ffmpeg: 'screen' },
  { id: 'color-dodge', label: 'Color Dodge', group: 'Lighten', css: 'color-dodge', ffmpeg: 'dodge' },
  { id: 'dodge', label: 'Dodge', group: 'Lighten', css: 'color-dodge', ffmpeg: 'dodge' },
  { id: 'linear-dodge', label: 'Linear Dodge (Add)', group: 'Lighten', css: 'plus-lighter', ffmpeg: 'addition' },
  { id: 'addition', label: 'Addition', group: 'Lighten', css: 'plus-lighter', ffmpeg: 'addition' },
  { id: 'bleach', label: 'Bleach', group: 'Lighten', css: 'screen', ffmpeg: 'bleach' },
  { id: 'glow', label: 'Glow', group: 'Lighten', css: 'screen', ffmpeg: 'glow' },

  // —— Contrast ——
  { id: 'overlay', label: 'Overlay', group: 'Contrast', css: 'overlay', ffmpeg: 'overlay' },
  { id: 'soft-light', label: 'Soft Light', group: 'Contrast', css: 'soft-light', ffmpeg: 'softlight' },
  { id: 'hard-light', label: 'Hard Light', group: 'Contrast', css: 'hard-light', ffmpeg: 'hardlight' },
  { id: 'vivid-light', label: 'Vivid Light', group: 'Contrast', css: 'color-dodge', ffmpeg: 'vividlight' },
  { id: 'linear-light', label: 'Linear Light', group: 'Contrast', css: 'hard-light', ffmpeg: 'linearlight' },
  { id: 'pin-light', label: 'Pin Light', group: 'Contrast', css: 'lighten', ffmpeg: 'pinlight' },
  { id: 'hard-mix', label: 'Hard Mix', group: 'Contrast', css: 'hard-light', ffmpeg: 'hardmix' },
  { id: 'hard-overlay', label: 'Hard Overlay', group: 'Contrast', css: 'overlay', ffmpeg: 'hardoverlay' },
  { id: 'reflect', label: 'Reflect', group: 'Contrast', css: 'color-dodge', ffmpeg: 'reflect' },
  { id: 'heat', label: 'Heat', group: 'Contrast', css: 'color-burn', ffmpeg: 'heat' },

  // —— Inversion / compare ——
  { id: 'difference', label: 'Difference', group: 'Inversion', css: 'difference', ffmpeg: 'difference' },
  { id: 'exclusion', label: 'Exclusion', group: 'Inversion', css: 'exclusion', ffmpeg: 'exclusion' },
  { id: 'negation', label: 'Negation', group: 'Inversion', css: 'difference', ffmpeg: 'negation' },
  { id: 'subtract', label: 'Subtract', group: 'Inversion', css: 'difference', ffmpeg: 'subtract' },
  { id: 'divide', label: 'Divide', group: 'Inversion', css: 'color-dodge', ffmpeg: 'divide' },
  { id: 'soft-difference', label: 'Soft Difference', group: 'Inversion', css: 'difference', ffmpeg: 'softdifference' },
  { id: 'extremity', label: 'Extremity', group: 'Inversion', css: 'difference', ffmpeg: 'extremity' },
  { id: 'phoenix', label: 'Phoenix', group: 'Inversion', css: 'exclusion', ffmpeg: 'phoenix' },

  // —— Component (HSL) ——
  { id: 'hue', label: 'Hue', group: 'Component', css: 'hue', ffmpeg: 'normal' },
  { id: 'saturation', label: 'Saturation', group: 'Component', css: 'saturation', ffmpeg: 'normal' },
  { id: 'color', label: 'Color', group: 'Component', css: 'color', ffmpeg: 'normal' },
  { id: 'luminosity', label: 'Luminosity (Luma)', group: 'Component', css: 'luminosity', ffmpeg: 'normal' },

  // —— Math / utility ——
  { id: 'average', label: 'Average', group: 'Math', css: 'soft-light', ffmpeg: 'average' },
  { id: 'grain-merge', label: 'Grain Merge', group: 'Math', css: 'soft-light', ffmpeg: 'grainmerge' },
  { id: 'grain-extract', label: 'Grain Extract', group: 'Math', css: 'difference', ffmpeg: 'grainextract' },
  { id: 'geometric', label: 'Geometric', group: 'Math', css: 'multiply', ffmpeg: 'geometric' },
  { id: 'harmonic', label: 'Harmonic', group: 'Math', css: 'soft-light', ffmpeg: 'harmonic' },
  { id: 'interpolate', label: 'Interpolate', group: 'Math', css: 'soft-light', ffmpeg: 'interpolate' },
  { id: 'multiply128', label: 'Multiply 128', group: 'Math', css: 'multiply', ffmpeg: 'multiply128' },
  { id: 'and', label: 'AND', group: 'Math', css: 'darken', ffmpeg: 'and' },
  { id: 'or', label: 'OR', group: 'Math', css: 'lighten', ffmpeg: 'or' },
  { id: 'xor', label: 'XOR', group: 'Math', css: 'exclusion', ffmpeg: 'xor' },
]

const byId = new Map(BLEND_MODES.map((m) => [m.id, m]))

export function getBlendMode(id: string | undefined | null): BlendModeDef {
  if (id && byId.has(id as BlendModeId)) return byId.get(id as BlendModeId)!
  return byId.get('normal')!
}

export function isBlendModeId(id: string): id is BlendModeId {
  return byId.has(id as BlendModeId)
}

export function blendModeGroups(): { group: string; modes: BlendModeDef[] }[] {
  const order: string[] = []
  const map = new Map<string, BlendModeDef[]>()
  for (const m of BLEND_MODES) {
    if (!map.has(m.group)) {
      map.set(m.group, [])
      order.push(m.group)
    }
    map.get(m.group)!.push(m)
  }
  return order.map((group) => ({ group, modes: map.get(group)! }))
}

export const DEFAULT_BLEND_MODE: BlendModeId = 'normal'
