import type { Rect } from './types'

/** Smallest integer >= n, guarding against float dust from scaling. */
const EPS = 1e-6

/** Turn any two corner points into a positive-area rect. */
export function rectFromPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

/** Flip negative width/height into a top-left anchored rect. */
export function normalizeRect(rect: Rect): Rect {
  return rectFromPoints(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Clip a rect to the image bounds and snap it to whole pixels, so the pixel
 * loops never read outside the buffer. Returns null when nothing survives.
 */
export function clampRectToBounds(
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
): Rect | null {
  const n = normalizeRect(rect)
  const left = clamp(Math.floor(n.x + EPS), 0, imageWidth)
  const top = clamp(Math.floor(n.y + EPS), 0, imageHeight)
  const right = clamp(Math.ceil(n.x + n.width - EPS), 0, imageWidth)
  const bottom = clamp(Math.ceil(n.y + n.height - EPS), 0, imageHeight)
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) return null
  return { x: left, y: top, width, height }
}

/** Multiply a rect by a scale factor (used when exporting at 40% / 65%). */
export function scaleRect(rect: Rect, scale: number): Rect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

export function rectContains(rect: Rect, px: number, py: number): boolean {
  const n = normalizeRect(rect)
  return px >= n.x && px <= n.x + n.width && py >= n.y && py <= n.y + n.height
}

export function rectArea(rect: Rect): number {
  return Math.abs(rect.width * rect.height)
}

/**
 * Topmost region under a point. Regions drawn later sit on top, so we walk
 * the list backwards.
 */
export function hitTest<T extends Rect & { id: string }>(
  regions: readonly T[],
  px: number,
  py: number,
): T | null {
  for (let i = regions.length - 1; i >= 0; i -= 1) {
    if (rectContains(regions[i], px, py)) return regions[i]
  }
  return null
}

/**
 * Fit `imageWidth x imageHeight` inside a box without upscaling past 1:1,
 * returning the display size and the display->image scale factor.
 */
export function fitToBox(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number; scale: number } {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { width: 0, height: 0, scale: 1 }
  }
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight, 1)
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    scale,
  }
}

/** Map a point from on-screen canvas space into image-pixel space. */
export function displayToImage(
  point: { x: number; y: number },
  displayScale: number,
): { x: number; y: number } {
  const s = displayScale === 0 ? 1 : displayScale
  return { x: point.x / s, y: point.y / s }
}

/** Round a rect outward to whole pixels. */
export function roundRect(rect: Rect): Rect {
  const n = normalizeRect(rect)
  const left = Math.round(n.x)
  const top = Math.round(n.y)
  return {
    x: left,
    y: top,
    width: Math.round(n.x + n.width) - left,
    height: Math.round(n.y + n.height) - top,
  }
}

/**
 * Scale a region into another resolution — used to mirror full-res regions
 * onto the lower-res preview buffer. Strength scales with it so the preview
 * matches what gets exported.
 */
export function scaleRegion<T extends Rect & { strength: number }>(
  region: T,
  scale: number,
): T {
  return {
    ...region,
    ...scaleRect(region, scale),
    strength: Math.max(1, region.strength * scale),
  }
}

/** Which edges a resize handle drags. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: readonly Handle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]

const HANDLE_EDGES: Record<Handle, { l: 0 | 1; r: 0 | 1; t: 0 | 1; b: 0 | 1 }> = {
  nw: { l: 1, r: 0, t: 1, b: 0 },
  n: { l: 0, r: 0, t: 1, b: 0 },
  ne: { l: 0, r: 1, t: 1, b: 0 },
  e: { l: 0, r: 1, t: 0, b: 0 },
  se: { l: 0, r: 1, t: 0, b: 1 },
  s: { l: 0, r: 0, t: 0, b: 1 },
  sw: { l: 1, r: 0, t: 0, b: 1 },
  w: { l: 1, r: 0, t: 0, b: 0 },
}

/**
 * Drag one handle of `origin` by (dx, dy). The result is normalized, so
 * dragging an edge past its opposite flips the rect rather than inverting it.
 */
export function resizeRect(
  origin: Rect,
  handle: Handle,
  dx: number,
  dy: number,
): Rect {
  const edges = HANDLE_EDGES[handle]
  const left = origin.x + (edges.l ? dx : 0)
  const right = origin.x + origin.width + (edges.r ? dx : 0)
  const top = origin.y + (edges.t ? dy : 0)
  const bottom = origin.y + origin.height + (edges.b ? dy : 0)
  return rectFromPoints(left, top, right, bottom)
}

/** Move a rect by (dx, dy), keeping it fully inside the image. */
export function moveRectWithin(
  origin: Rect,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): Rect {
  return {
    ...origin,
    x: clamp(origin.x + dx, 0, Math.max(0, imageWidth - origin.width)),
    y: clamp(origin.y + dy, 0, Math.max(0, imageHeight - origin.height)),
  }
}
