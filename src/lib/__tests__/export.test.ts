import { describe, expect, it } from 'vitest'
import {
  MIME_BY_FORMAT,
  SIZE_PRESETS,
  buildFileName,
  formatBytes,
  getPreset,
  qualityArg,
  scaledDimensions,
  stripExtension,
} from '../export'

describe('SIZE_PRESETS', () => {
  it('offers exactly original, medium and small', () => {
    expect(SIZE_PRESETS.map((preset) => preset.key)).toEqual([
      'original',
      'medium',
      'small',
    ])
  })

  it('uses the scales the brief asks for', () => {
    expect(getPreset('original').scale).toBe(1)
    expect(getPreset('medium').scale).toBe(0.65)
    expect(getPreset('small').scale).toBe(0.4)
  })

  it('throws on an unknown key', () => {
    // @ts-expect-error deliberately invalid key
    expect(() => getPreset('tiny')).toThrow(/Unknown size preset/)
  })
})

describe('scaledDimensions', () => {
  it('scales and rounds', () => {
    expect(scaledDimensions(1000, 800, 0.65)).toEqual({ width: 650, height: 520 })
    expect(scaledDimensions(1000, 800, 0.4)).toEqual({ width: 400, height: 320 })
  })

  it('passes the original through at scale 1', () => {
    expect(scaledDimensions(1920, 1080, 1)).toEqual({ width: 1920, height: 1080 })
  })

  it('rounds odd dimensions to the nearest pixel', () => {
    expect(scaledDimensions(101, 33, 0.65)).toEqual({ width: 66, height: 21 })
  })

  it('never collapses a tiny image to zero pixels', () => {
    expect(scaledDimensions(1, 1, 0.4)).toEqual({ width: 1, height: 1 })
  })
})

describe('stripExtension', () => {
  it('drops a trailing extension', () => {
    expect(stripExtension('holiday.png')).toBe('holiday')
  })

  it('keeps dots inside the name', () => {
    expect(stripExtension('screenshot.2024.01.02.jpeg')).toBe(
      'screenshot.2024.01.02',
    )
  })

  it('leaves a name with no extension alone', () => {
    expect(stripExtension('receipt')).toBe('receipt')
  })

  it('does not eat a leading dot', () => {
    expect(stripExtension('.hidden')).toBe('.hidden')
  })

  it('discards any directory prefix', () => {
    expect(stripExtension('photos/summer/beach.jpg')).toBe('beach')
  })
})

describe('buildFileName', () => {
  it('marks the original without a size suffix', () => {
    expect(buildFileName('holiday.png', 'original', 'png')).toBe(
      'holiday-blurred.png',
    )
  })

  it('adds the size suffix for scaled exports', () => {
    expect(buildFileName('holiday.png', 'small', 'png')).toBe(
      'holiday-blurred-small.png',
    )
    expect(buildFileName('holiday.png', 'medium', 'png')).toBe(
      'holiday-blurred-medium.png',
    )
  })

  it('uses the chosen format extension, not the source one', () => {
    expect(buildFileName('shot.png', 'original', 'jpeg')).toBe(
      'shot-blurred.jpg',
    )
    expect(buildFileName('shot.png', 'medium', 'webp')).toBe(
      'shot-blurred-medium.webp',
    )
  })

  it('falls back to a generic stem for an empty name', () => {
    expect(buildFileName('', 'original', 'png')).toBe('image-blurred.png')
    expect(buildFileName('   ', 'small', 'png')).toBe('image-blurred-small.png')
  })
})

describe('formatBytes', () => {
  it('shows raw bytes below 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
  })

  it('steps up through KB, MB and GB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })

  it('drops the decimal once the number gets big', () => {
    expect(formatBytes(64 * 1024)).toBe('64 KB')
  })

  it('handles nonsense input gracefully', () => {
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(-5)).toBe('—')
  })
})

describe('format plumbing', () => {
  it('maps every format to a canvas mime type', () => {
    expect(MIME_BY_FORMAT).toEqual({
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    })
  })

  it('only passes a quality argument for lossy formats', () => {
    expect(qualityArg('png', 0.8)).toBeUndefined()
    expect(qualityArg('jpeg', 0.8)).toBe(0.8)
    expect(qualityArg('webp', 0.5)).toBe(0.5)
  })
})
