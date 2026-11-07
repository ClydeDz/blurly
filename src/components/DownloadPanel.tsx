import type { CSSProperties } from 'react'
import Icon from './Icon'
import { SIZE_PRESETS, scaledDimensions } from '../lib/export'
import type { ExportFormat, SizeKey } from '../lib/types'

interface DownloadPanelProps {
  imageWidth: number
  imageHeight: number
  format: ExportFormat
  quality: number
  busyKey: SizeKey | null
  lastSaved: { key: SizeKey; size: string } | null
  onFormatChange: (format: ExportFormat) => void
  onQualityChange: (quality: number) => void
  onDownload: (key: SizeKey) => void
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]

export default function DownloadPanel({
  imageWidth,
  imageHeight,
  format,
  quality,
  busyKey,
  lastSaved,
  onFormatChange,
  onQualityChange,
  onDownload,
}: DownloadPanelProps) {
  const lossy = format !== 'png'

  return (
    <section className="panel" aria-labelledby="download-heading">
      <header className="panel__header">
        <h2 id="download-heading" className="panel__title">
          <Icon name="download" size={15} /> Download
        </h2>
      </header>

      <div className="field">
        <span className="field__label" id="format-label">
          Format
        </span>
        <div className="segmented" role="group" aria-labelledby="format-label">
          {FORMATS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__option"
              aria-pressed={format === option.value}
              onClick={() => onFormatChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {lossy && (
        <div className="field">
          <div className="field__label">
            <label htmlFor="quality">Quality</label>
            <span className="field__value" aria-hidden="true">
              {Math.round(quality * 100)}%
            </span>
          </div>
          <input
            id="quality"
            className="slider"
            type="range"
            min={40}
            max={100}
            step={1}
            value={Math.round(quality * 100)}
            style={{ '--fill': `${((quality * 100 - 40) / 60) * 100}%` } as CSSProperties}
            aria-valuetext={`${Math.round(quality * 100)} percent`}
            onChange={(event) =>
              onQualityChange(Number(event.target.value) / 100)
            }
          />
        </div>
      )}

      <ul className="size-list">
        {SIZE_PRESETS.map((preset) => {
          const dims = scaledDimensions(imageWidth, imageHeight, preset.scale)
          const isBusy = busyKey === preset.key
          return (
            <li key={preset.key}>
              <button
                type="button"
                className="size-card"
                title={preset.blurb}
                disabled={busyKey !== null}
                onClick={() => onDownload(preset.key)}
              >
                <span className="size-card__badge">
                  {Math.round(preset.scale * 100)}%
                </span>
                <span className="size-card__body">
                  <span className="size-card__label">{preset.label}</span>
                  <span className="size-card__meta">
                    {dims.width} × {dims.height}
                  </span>
                </span>
                <span className="size-card__cta">
                  {isBusy ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <Icon name="download" size={15} />
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="save-status" role="status">
        {busyKey
          ? 'Rendering your image…'
          : lastSaved
            ? `Saved the ${lastSaved.key} version (${lastSaved.size}).`
            : 'Effects are baked in at full resolution, then resized.'}
      </p>
    </section>
  )
}
