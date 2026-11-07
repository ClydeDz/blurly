import { clampStrength } from './effects'
import { clamp, normalizeRect } from './geometry'
import type { EffectSettings, Rect, Region } from './types'

/** A drawn region smaller than this (in image px) is treated as a stray click. */
export const MIN_REGION_SIZE = 6

let counter = 0

export function nextRegionId(): string {
  counter += 1
  return `region-${counter}`
}

/** For tests, so ids stay predictable across cases. */
export function resetRegionIds(): void {
  counter = 0
}

export function isRegionUsable(rect: Rect): boolean {
  const n = normalizeRect(rect)
  return n.width >= MIN_REGION_SIZE && n.height >= MIN_REGION_SIZE
}

/** Clip a rect to the image, keeping it at least `MIN_REGION_SIZE` on a side. */
export function fitRegionToImage(
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
): Rect {
  const n = normalizeRect(rect)
  // Clip each edge independently — clamping the origin alone would keep the
  // original width and let the rect run back off the far side.
  const left = clamp(n.x, 0, imageWidth)
  const top = clamp(n.y, 0, imageHeight)
  const right = clamp(n.x + n.width, 0, imageWidth)
  const bottom = clamp(n.y + n.height, 0, imageHeight)
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

export function createRegion(rect: Rect, settings: EffectSettings): Region {
  return {
    id: nextRegionId(),
    ...normalizeRect(rect),
    effect: settings.effect,
    shape: settings.shape,
    strength: clampStrength(settings.effect, settings.strength),
    feather: clamp(settings.feather, 0, 1),
  }
}

export function updateRegion(
  regions: readonly Region[],
  id: string,
  patch: Partial<Region>,
): Region[] {
  return regions.map((region) =>
    region.id === id ? { ...region, ...patch } : region,
  )
}

export function removeRegion(
  regions: readonly Region[],
  id: string,
): Region[] {
  return regions.filter((region) => region.id !== id)
}

export const DEFAULT_SETTINGS: EffectSettings = {
  effect: 'blur',
  shape: 'rect',
  strength: 18,
  feather: 0.15,
}

/** Human-readable summary shown in the region list. */
export function describeRegion(region: Region): string {
  const kind = region.effect === 'blur' ? 'Blur' : 'Pixelate'
  const unit = region.effect === 'blur' ? 'radius' : 'blocks'
  const shape = region.shape === 'ellipse' ? 'Oval' : 'Box'
  return `${shape} · ${kind} ${Math.round(region.strength)}px ${unit}`
}
