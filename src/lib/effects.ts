import { clamp, clampRectToBounds } from './geometry'
import type { PixelBuffer, Rect, Region, Shape } from './types'

export const MIN_BLUR = 1
export const MAX_BLUR = 60
export const MIN_PIXEL = 2
export const MAX_PIXEL = 80

export function createBuffer(width: number, height: number): PixelBuffer {
  return { data: new Uint8ClampedArray(width * height * 4), width, height }
}

export function cloneBuffer(buf: PixelBuffer): PixelBuffer {
  return {
    data: new Uint8ClampedArray(buf.data),
    width: buf.width,
    height: buf.height,
  }
}

/** Copy the pixels covered by `rect` into a standalone buffer. */
export function extractRegion(buf: PixelBuffer, rect: Rect): PixelBuffer {
  const out = createBuffer(rect.width, rect.height)
  for (let y = 0; y < rect.height; y += 1) {
    const srcStart = ((rect.y + y) * buf.width + rect.x) * 4
    out.data.set(
      buf.data.subarray(srcStart, srcStart + rect.width * 4),
      y * rect.width * 4,
    )
  }
  return out
}

/**
 * Box widths that approximate a Gaussian of the given sigma over `n` passes.
 * From Ivan Kutskir's "Fastest Gaussian blur" derivation.
 */
export function boxesForGauss(sigma: number, n: number): number[] {
  if (sigma <= 0) return new Array(n).fill(1)
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl -= 1
  wl = Math.max(1, wl)
  const wu = wl + 2
  const mIdeal =
    (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)
  const m = Math.round(mIdeal)
  const sizes: number[] = []
  for (let i = 0; i < n; i += 1) sizes.push(i < m ? wl : wu)
  return sizes
}

/** One separable box pass with clamped edges. `horizontal` picks the axis. */
function boxPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const lineLength = horizontal ? width : height
  const lineCount = horizontal ? height : width
  const window = radius * 2 + 1
  const idx = horizontal
    ? (line: number, i: number) => (line * width + i) * 4
    : (line: number, i: number) => (i * width + line) * 4

  for (let line = 0; line < lineCount; line += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0
      // Seed the sliding window, clamping past both ends of the line.
      for (let i = -radius; i <= radius; i += 1) {
        sum += src[idx(line, clamp(i, 0, lineLength - 1)) + c]
      }
      for (let i = 0; i < lineLength; i += 1) {
        dst[idx(line, i) + c] = sum / window
        sum -= src[idx(line, clamp(i - radius, 0, lineLength - 1)) + c]
        sum += src[idx(line, clamp(i + radius + 1, 0, lineLength - 1)) + c]
      }
    }
  }
}

/**
 * Gaussian-ish blur, in place. Alpha is premultiplied first so transparent
 * pixels don't drag their colour into their neighbours.
 */
export function blurBuffer(buf: PixelBuffer, sigma: number): PixelBuffer {
  const { width, height } = buf
  if (sigma <= 0 || width === 0 || height === 0) return buf

  const premultiplied = new Float32Array(buf.data.length)
  for (let i = 0; i < buf.data.length; i += 4) {
    const a = buf.data[i + 3] / 255
    premultiplied[i] = buf.data[i] * a
    premultiplied[i + 1] = buf.data[i + 1] * a
    premultiplied[i + 2] = buf.data[i + 2] * a
    premultiplied[i + 3] = buf.data[i + 3]
  }

  let src = Uint8ClampedArray.from(premultiplied)
  let dst = new Uint8ClampedArray(src.length)

  for (const boxWidth of boxesForGauss(sigma, 3)) {
    const radius = Math.max(1, (boxWidth - 1) / 2)
    boxPass(src, dst, width, height, radius, true)
    ;[src, dst] = [dst, src]
    boxPass(src, dst, width, height, radius, false)
    ;[src, dst] = [dst, src]
  }

  for (let i = 0; i < buf.data.length; i += 4) {
    const a = src[i + 3] / 255
    if (a === 0) {
      buf.data[i] = 0
      buf.data[i + 1] = 0
      buf.data[i + 2] = 0
      buf.data[i + 3] = 0
    } else {
      buf.data[i] = src[i] / a
      buf.data[i + 1] = src[i + 1] / a
      buf.data[i + 2] = src[i + 2] / a
      buf.data[i + 3] = src[i + 3]
    }
  }
  return buf
}

/** Replace each `blockSize` square with its average colour, in place. */
export function pixelateBuffer(
  buf: PixelBuffer,
  blockSize: number,
): PixelBuffer {
  const { width, height, data } = buf
  const size = Math.max(1, Math.round(blockSize))
  if (size === 1 || width === 0 || height === 0) return buf

  for (let by = 0; by < height; by += size) {
    for (let bx = 0; bx < width; bx += size) {
      const maxX = Math.min(bx + size, width)
      const maxY = Math.min(by + size, height)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0
      for (let y = by; y < maxY; y += 1) {
        for (let x = bx; x < maxX; x += 1) {
          const i = (y * width + x) * 4
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += data[i + 3]
          count += 1
        }
      }
      r /= count
      g /= count
      b /= count
      a /= count
      for (let y = by; y < maxY; y += 1) {
        for (let x = bx; x < maxX; x += 1) {
          const i = (y * width + x) * 4
          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = a
        }
      }
    }
  }
  return buf
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Per-pixel coverage (0..1) for a region of the given shape. `feather`
 * of 0 still keeps a hair of antialiasing so edges never look ragged.
 */
export function buildMask(
  width: number,
  height: number,
  shape: Shape,
  feather: number,
): Float32Array {
  const mask = new Float32Array(width * height)
  const f = clamp(feather, 0, 1)

  if (shape === 'ellipse') {
    const a = width / 2
    const b = height / 2
    const minAxis = Math.max(1, Math.min(a, b))
    // Always fade over at least one pixel to avoid a stair-stepped edge.
    const fade = Math.max(1 / minAxis, f * 0.85)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = (x + 0.5 - a) / a
        const dy = (y + 0.5 - b) / b
        const r = Math.sqrt(dx * dx + dy * dy)
        mask[y * width + x] = 1 - smoothstep(1 - fade, 1, r)
      }
    }
    return mask
  }

  const fadePx = (f * Math.min(width, height)) / 2
  if (fadePx < 0.5) {
    mask.fill(1)
    return mask
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.min(x, y, width - 1 - x, height - 1 - y)
      mask[y * width + x] = smoothstep(0, fadePx, distance)
    }
  }
  return mask
}

/** Blend `patch` back into `dest` at `rect`, weighted by `mask`. */
export function compositeRegion(
  dest: PixelBuffer,
  patch: PixelBuffer,
  rect: Rect,
  mask: Float32Array,
): PixelBuffer {
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const alpha = mask[y * rect.width + x]
      if (alpha <= 0) continue
      const di = ((rect.y + y) * dest.width + (rect.x + x)) * 4
      const si = (y * rect.width + x) * 4
      if (alpha >= 1) {
        dest.data[di] = patch.data[si]
        dest.data[di + 1] = patch.data[si + 1]
        dest.data[di + 2] = patch.data[si + 2]
        dest.data[di + 3] = patch.data[si + 3]
        continue
      }
      const inv = 1 - alpha
      dest.data[di] = patch.data[si] * alpha + dest.data[di] * inv
      dest.data[di + 1] = patch.data[si + 1] * alpha + dest.data[di + 1] * inv
      dest.data[di + 2] = patch.data[si + 2] * alpha + dest.data[di + 2] * inv
      dest.data[di + 3] = patch.data[si + 3] * alpha + dest.data[di + 3] * inv
    }
  }
  return dest
}

/** Apply one region to `buf`, in place. No-op when it falls outside bounds. */
export function applyRegion(buf: PixelBuffer, region: Region): PixelBuffer {
  const rect = clampRectToBounds(region, buf.width, buf.height)
  if (!rect) return buf

  const patch = extractRegion(buf, rect)
  if (region.effect === 'pixelate') {
    pixelateBuffer(patch, region.strength)
  } else {
    blurBuffer(patch, region.strength)
  }
  const mask = buildMask(rect.width, rect.height, region.shape, region.feather)
  return compositeRegion(buf, patch, rect, mask)
}

/** Apply every region, in draw order, to a copy of `buf`. */
export function applyRegions(
  buf: PixelBuffer,
  regions: readonly Region[],
): PixelBuffer {
  const out = cloneBuffer(buf)
  for (const region of regions) applyRegion(out, region)
  return out
}

/** Clamp a strength value to the range that makes sense for the effect. */
export function clampStrength(effect: Region['effect'], value: number): number {
  return effect === 'pixelate'
    ? clamp(Math.round(value), MIN_PIXEL, MAX_PIXEL)
    : clamp(Math.round(value), MIN_BLUR, MAX_BLUR)
}

/**
 * Same as `applyRegions`, but reuses `dest` instead of allocating. The live
 * preview calls this on every pointer move, so the copy matters.
 */
export function applyRegionsInto(
  dest: PixelBuffer,
  source: PixelBuffer,
  regions: readonly Region[],
): PixelBuffer {
  dest.data.set(source.data)
  for (const region of regions) applyRegion(dest, region)
  return dest
}
