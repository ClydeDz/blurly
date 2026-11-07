import type { CSSProperties } from 'react'
import Icon, { type IconName } from './Icon'
import {
  MAX_BLUR,
  MAX_PIXEL,
  MIN_BLUR,
  MIN_PIXEL,
  clampStrength,
} from '../lib/effects'
import { describeRegion } from '../lib/regions'
import type { EffectKind, EffectSettings, Region, Shape } from '../lib/types'

interface ControlPanelProps {
  settings: EffectSettings
  regions: readonly Region[]
  selectedId: string | null
  canUndo: boolean
  canRedo: boolean
  onSettingsChange: (patch: Partial<EffectSettings>) => void
  onSelect: (id: string | null) => void
  onRemove: (id: string) => void
  onClear: () => void
  onUndo: () => void
  onRedo: () => void
}

const EFFECTS: { value: EffectKind; label: string; icon: IconName }[] = [
  { value: 'blur', label: 'Blur', icon: 'droplet' },
  { value: 'pixelate', label: 'Pixelate', icon: 'grid' },
]

const SHAPES: { value: Shape; label: string; icon: IconName }[] = [
  { value: 'rect', label: 'Box', icon: 'square' },
  { value: 'ellipse', label: 'Oval', icon: 'circle' },
]

export default function ControlPanel({
  settings,
  regions,
  selectedId,
  canUndo,
  canRedo,
  onSettingsChange,
  onSelect,
  onRemove,
  onClear,
  onUndo,
  onRedo,
}: ControlPanelProps) {
  const isPixelate = settings.effect === 'pixelate'
  const min = isPixelate ? MIN_PIXEL : MIN_BLUR
  const max = isPixelate ? MAX_PIXEL : MAX_BLUR
  const strength = clampStrength(settings.effect, settings.strength)

  return (
    <section className="panel" aria-labelledby="tools-heading">
      <header className="panel__header">
        <h2 id="tools-heading" className="panel__title">
          <Icon name="sliders" size={15} /> Effect
        </h2>
        <div className="panel__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (⌘Z)"
          >
            <Icon name="undo" size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
          >
            <Icon name="redo" size={15} />
          </button>
        </div>
      </header>

      <div className="field">
        <span className="field__label" id="effect-label">
          Style
        </span>
        <div className="segmented" role="group" aria-labelledby="effect-label">
          {EFFECTS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__option"
              aria-pressed={settings.effect === option.value}
              onClick={() => onSettingsChange({ effect: option.value })}
            >
              <Icon name={option.icon} size={14} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label" id="shape-label">
          Shape
        </span>
        <div className="segmented" role="group" aria-labelledby="shape-label">
          {SHAPES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__option"
              aria-pressed={settings.shape === option.value}
              onClick={() => onSettingsChange({ shape: option.value })}
            >
              <Icon name={option.icon} size={14} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field__label">
          <label htmlFor="strength">
            {isPixelate ? 'Pixel size' : 'Blur radius'}
          </label>
          <span className="field__value" aria-hidden="true">
            {strength}px
          </span>
        </div>
        <input
          id="strength"
          className="slider"
          type="range"
          min={min}
          max={max}
          step={1}
          value={strength}
          style={{ '--fill': `${((strength - min) / (max - min)) * 100}%` } as CSSProperties}
          aria-valuetext={`${strength} pixels`}
          onChange={(event) =>
            onSettingsChange({ strength: Number(event.target.value) })
          }
        />
      </div>

      <div className="field">
        <div className="field__label">
          <label htmlFor="feather">Edge softness</label>
          <span className="field__value" aria-hidden="true">
            {Math.round(settings.feather * 100)}%
          </span>
        </div>
        <input
          id="feather"
          className="slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(settings.feather * 100)}
          style={{ '--fill': `${Math.round(settings.feather * 100)}%` } as CSSProperties}
          aria-valuetext={`${Math.round(settings.feather * 100)} percent`}
          onChange={(event) =>
            onSettingsChange({ feather: Number(event.target.value) / 100 })
          }
        />
      </div>

      <div className="panel__divider" role="presentation" />

      <header className="panel__header panel__header--sub">
        <h3 className="panel__title panel__title--sm">
          Areas
          <span className="pill">{regions.length}</span>
        </h3>
        {regions.length > 0 && (
          <button type="button" className="link-btn" onClick={onClear}>
            Clear all
          </button>
        )}
      </header>

      {regions.length === 0 ? (
        <p className="empty-note">
          Drag on the image to cover something up. Add as many areas as you like.
        </p>
      ) : (
        <ul className="region-list">
          {regions.map((region, index) => (
            <li key={region.id}>
              <button
                type="button"
                className="region-item"
                aria-current={region.id === selectedId}
                onClick={() => onSelect(region.id)}
              >
                <span className="region-item__index">{index + 1}</span>
                <span className="region-item__text">
                  {describeRegion(region)}
                </span>
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={`Delete area ${index + 1}`}
                onClick={() => onRemove(region.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
