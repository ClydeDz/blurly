import type { ExportFormat, SizeKey, SizePreset } from './types'

export const SIZE_PRESETS: readonly SizePreset[] = [
  {
    key: 'original',
    label: 'Original',
    scale: 1,
    blurb: 'Full quality, full dimensions',
  },
  {
    key: 'medium',
    label: 'Medium',
    scale: 0.65,
    blurb: '65% of the original size',
  },
  {
    key: 'small',
    label: 'Small',
    scale: 0.4,
    blurb: '40% of the original size',
  },
] as const

export function getPreset(key: SizeKey): SizePreset {
  const preset = SIZE_PRESETS.find((p) => p.key === key)
  if (!preset) throw new Error(`Unknown size preset: ${key}`)
  return preset
}

/**
 * Dimensions for a scaled export. Always at least 1x1 so a tiny source
 * image can still be exported at 40%.
 */
export function scaledDimensions(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const EXTENSION_BY_FORMAT: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
}

/** Strip the extension off a file name, keeping any dots inside the stem. */
export function stripExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** e.g. `holiday.png` at 40% -> `holiday-blurred-small.png` */
export function buildFileName(
  originalName: string,
  sizeKey: SizeKey,
  format: ExportFormat,
): string {
  const stem = stripExtension(originalName).trim() || 'image'
  const suffix = sizeKey === 'original' ? '' : `-${sizeKey}`
  return `${stem}-blurred${suffix}.${EXTENSION_BY_FORMAT[format]}`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`
}

/** JPEG/WebP take a quality argument; PNG ignores it. */
export function qualityArg(
  format: ExportFormat,
  quality: number,
): number | undefined {
  return format === 'png' ? undefined : quality
}
