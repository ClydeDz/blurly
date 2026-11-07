import { describe, expect, it } from 'vitest'
import {
  MAX_BLUR,
  MAX_PIXEL,
  MIN_BLUR,
  MIN_PIXEL,
  applyRegion,
  applyRegions,
  applyRegionsInto,
  blurBuffer,
  boxesForGauss,
  buildMask,
  clampStrength,
  cloneBuffer,
  compositeRegion,
  createBuffer,
  extractRegion,
  pixelateBuffer,
} from '../effects'
import type { PixelBuffer, Region } from '../types'

type RGBA = [number, number, number, number]

function makeBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => RGBA,
): PixelBuffer {
  const buf = createBuffer(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y)
      const i = (y * width + x) * 4
      buf.data[i] = r
      buf.data[i + 1] = g
      buf.data[i + 2] = b
      buf.data[i + 3] = a
    }
  }
  return buf
}

function pixelAt(buf: PixelBuffer, x: number, y: number): RGBA {
  const i = (y * buf.width + x) * 4
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]]
}

const solid = (w: number, h: number, color: RGBA) =>
  makeBuffer(w, h, () => color)

function region(overrides: Partial<Region> = {}): Region {
  return {
    id: 'r1',
    x: 0,
    y: 0,
    width: 8,
    height: 8,
    effect: 'blur',
    shape: 'rect',
    strength: 4,
    feather: 0,
    ...overrides,
  }
}

describe('createBuffer / cloneBuffer', () => {
  it('allocates 4 bytes per pixel', () => {
    expect(createBuffer(3, 2).data).toHaveLength(24)
  })

  it('clones without sharing memory', () => {
    const original = solid(2, 2, [10, 20, 30, 255])
    const copy = cloneBuffer(original)
    copy.data[0] = 99
    expect(original.data[0]).toBe(10)
    expect(copy.width).toBe(2)
  })
})

describe('extractRegion', () => {
  it('copies exactly the requested window', () => {
    // Each pixel's red channel encodes its x, green its y.
    const buf = makeBuffer(4, 4, (x, y) => [x * 10, y * 10, 0, 255])
    const patch = extractRegion(buf, { x: 1, y: 2, width: 2, height: 2 })
    expect(patch.width).toBe(2)
    expect(patch.height).toBe(2)
    expect(pixelAt(patch, 0, 0)).toEqual([10, 20, 0, 255])
    expect(pixelAt(patch, 1, 1)).toEqual([20, 30, 0, 255])
  })
})

describe('boxesForGauss', () => {
  it('returns one box width per pass', () => {
    expect(boxesForGauss(5, 3)).toHaveLength(3)
  })

  it('returns odd box widths so the kernel stays centred', () => {
    for (const width of boxesForGauss(9, 3)) {
      expect(width % 2).toBe(1)
    }
  })

  it('grows the kernel as sigma grows', () => {
    const small = boxesForGauss(2, 3).reduce((a, b) => a + b, 0)
    const large = boxesForGauss(20, 3).reduce((a, b) => a + b, 0)
    expect(large).toBeGreaterThan(small)
  })

  it('degrades to a no-op kernel at sigma 0', () => {
    expect(boxesForGauss(0, 3)).toEqual([1, 1, 1])
  })
})

describe('blurBuffer', () => {
  it('leaves a flat colour untouched', () => {
    const buf = solid(16, 16, [120, 60, 200, 255])
    blurBuffer(buf, 6)
    expect(pixelAt(buf, 8, 8)).toEqual([120, 60, 200, 255])
    expect(pixelAt(buf, 0, 0)).toEqual([120, 60, 200, 255])
  })

  it('softens a hard vertical edge into a gradient', () => {
    const buf = makeBuffer(32, 8, (x) =>
      x < 16 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )
    blurBuffer(buf, 6)
    const [left] = pixelAt(buf, 15, 4)
    const [right] = pixelAt(buf, 16, 4)
    expect(left).toBeGreaterThan(0)
    expect(right).toBeLessThan(255)
    // The transition must still run dark -> light across the seam.
    expect(left).toBeLessThan(right)
    // And far from the seam the original extremes survive.
    expect(pixelAt(buf, 0, 4)[0]).toBeLessThan(60)
    expect(pixelAt(buf, 31, 4)[0]).toBeGreaterThan(195)
  })

  it('destroys fine detail, which is the whole point of redacting', () => {
    const checker = makeBuffer(24, 24, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )
    blurBuffer(checker, 8)
    const centre = pixelAt(checker, 12, 12)[0]
    expect(centre).toBeGreaterThan(100)
    expect(centre).toBeLessThan(155)
  })

  it('roughly preserves the average brightness', () => {
    const buf = makeBuffer(20, 20, (x) => [x * 12, x * 12, x * 12, 255])
    const before =
      buf.data.filter((_, i) => i % 4 === 0).reduce((a, b) => a + b, 0) / 400
    blurBuffer(buf, 4)
    const after =
      buf.data.filter((_, i) => i % 4 === 0).reduce((a, b) => a + b, 0) / 400
    expect(Math.abs(after - before)).toBeLessThan(6)
  })

  it('does not drag colour out of fully transparent pixels', () => {
    // Left half is opaque white, right half is transparent red.
    const buf = makeBuffer(16, 4, (x) =>
      x < 8 ? [255, 255, 255, 255] : [255, 0, 0, 0],
    )
    blurBuffer(buf, 3)
    const [r, g, b, a] = pixelAt(buf, 7, 2)
    expect(a).toBeGreaterThan(0)
    // Premultiplication keeps the transparent red from tinting the white.
    expect(g).toBeGreaterThan(200)
    expect(b).toBeGreaterThan(200)
    expect(r).toBeGreaterThan(200)
  })

  it('is a no-op at sigma 0', () => {
    const buf = makeBuffer(8, 8, (x, y) => [x * 8, y * 8, 0, 255])
    const before = Uint8ClampedArray.from(buf.data)
    blurBuffer(buf, 0)
    expect(buf.data).toEqual(before)
  })

  it('survives a 1x1 buffer', () => {
    const buf = solid(1, 1, [7, 8, 9, 255])
    expect(() => blurBuffer(buf, 10)).not.toThrow()
    expect(pixelAt(buf, 0, 0)).toEqual([7, 8, 9, 255])
  })
})

describe('pixelateBuffer', () => {
  it('replaces each block with its average colour', () => {
    // 4x4 split into four 2x2 quadrants of a single colour each.
    const buf = makeBuffer(4, 4, (x, y) =>
      x < 2
        ? y < 2
          ? [200, 0, 0, 255]
          : [0, 200, 0, 255]
        : y < 2
          ? [0, 0, 200, 255]
          : [200, 200, 200, 255],
    )
    pixelateBuffer(buf, 2)
    expect(pixelAt(buf, 0, 0)).toEqual([200, 0, 0, 255])
    expect(pixelAt(buf, 1, 1)).toEqual([200, 0, 0, 255])
    expect(pixelAt(buf, 3, 0)).toEqual([0, 0, 200, 255])
    expect(pixelAt(buf, 2, 3)).toEqual([200, 200, 200, 255])
  })

  it('averages a two-tone block into one flat mid-tone', () => {
    const buf = makeBuffer(2, 1, (x) =>
      x === 0 ? [0, 0, 0, 255] : [100, 100, 100, 255],
    )
    pixelateBuffer(buf, 2)
    expect(pixelAt(buf, 0, 0)).toEqual([50, 50, 50, 255])
    expect(pixelAt(buf, 1, 0)).toEqual([50, 50, 50, 255])
  })

  it('handles a trailing partial block at the edge', () => {
    const buf = makeBuffer(5, 1, (x) => [x % 2 === 0 ? 0 : 200, 0, 0, 255])
    expect(() => pixelateBuffer(buf, 2)).not.toThrow()
    // The final column is a block of one, so it keeps its own colour.
    expect(pixelAt(buf, 4, 0)[0]).toBe(0)
  })

  it('is a no-op at block size 1', () => {
    const buf = makeBuffer(4, 4, (x, y) => [x, y, 0, 255])
    const before = Uint8ClampedArray.from(buf.data)
    pixelateBuffer(buf, 1)
    expect(buf.data).toEqual(before)
  })

  it('flattens the whole region when the block covers it', () => {
    const buf = makeBuffer(4, 4, (x, y) => [(x + y) * 20, 0, 0, 255])
    pixelateBuffer(buf, 99)
    expect(pixelAt(buf, 0, 0)).toEqual(pixelAt(buf, 3, 3))
  })
})

describe('buildMask', () => {
  it('is fully opaque for a rect with no feather', () => {
    const mask = buildMask(6, 6, 'rect', 0)
    expect(Array.from(mask).every((value) => value === 1)).toBe(true)
  })

  it('fades a feathered rect from the edge inward', () => {
    const mask = buildMask(40, 40, 'rect', 0.5)
    const corner = mask[0]
    const centre = mask[20 * 40 + 20]
    expect(corner).toBeLessThan(0.05)
    expect(centre).toBe(1)
  })

  it('cuts the corners off an ellipse', () => {
    const mask = buildMask(21, 21, 'ellipse', 0)
    expect(mask[0]).toBeLessThan(0.05)
    expect(mask[20]).toBeLessThan(0.05)
    expect(mask[10 * 21 + 10]).toBe(1)
  })

  it('keeps the ellipse edge antialiased even at zero feather', () => {
    const mask = buildMask(40, 40, 'ellipse', 0)
    const values = new Set(Array.from(mask))
    expect(values.size).toBeGreaterThan(2)
  })

  it('produces values within 0..1 for every shape and feather', () => {
    for (const shape of ['rect', 'ellipse'] as const) {
      for (const feather of [0, 0.3, 1]) {
        for (const value of buildMask(12, 9, shape, feather)) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('compositeRegion', () => {
  it('replaces pixels where the mask is fully opaque', () => {
    const dest = solid(4, 4, [0, 0, 0, 255])
    const patch = solid(2, 2, [255, 255, 255, 255])
    compositeRegion(dest, patch, { x: 1, y: 1, width: 2, height: 2 }, new Float32Array(4).fill(1))
    expect(pixelAt(dest, 1, 1)).toEqual([255, 255, 255, 255])
    expect(pixelAt(dest, 0, 0)).toEqual([0, 0, 0, 255])
  })

  it('blends at partial mask values', () => {
    const dest = solid(2, 2, [0, 0, 0, 255])
    const patch = solid(2, 2, [200, 200, 200, 255])
    compositeRegion(dest, patch, { x: 0, y: 0, width: 2, height: 2 }, new Float32Array(4).fill(0.5))
    expect(pixelAt(dest, 0, 0)).toEqual([100, 100, 100, 255])
  })

  it('leaves pixels alone where the mask is zero', () => {
    const dest = solid(2, 2, [10, 20, 30, 255])
    const patch = solid(2, 2, [255, 255, 255, 255])
    compositeRegion(dest, patch, { x: 0, y: 0, width: 2, height: 2 }, new Float32Array(4))
    expect(pixelAt(dest, 1, 1)).toEqual([10, 20, 30, 255])
  })
})

describe('applyRegion', () => {
  it('changes pixels inside the region and nowhere else', () => {
    const buf = makeBuffer(20, 20, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )
    const before = cloneBuffer(buf)
    applyRegion(buf, region({ x: 5, y: 5, width: 8, height: 8, strength: 6 }))

    expect(pixelAt(buf, 8, 8)).not.toEqual(pixelAt(before, 8, 8))
    expect(pixelAt(buf, 0, 0)).toEqual(pixelAt(before, 0, 0))
    expect(pixelAt(buf, 19, 19)).toEqual(pixelAt(before, 19, 19))
  })

  it('pixelates only within the region', () => {
    const buf = makeBuffer(12, 12, (x) => [x * 20, 0, 0, 255])
    applyRegion(
      buf,
      region({ effect: 'pixelate', x: 0, y: 0, width: 4, height: 4, strength: 4 }),
    )
    expect(pixelAt(buf, 0, 0)).toEqual(pixelAt(buf, 3, 3))
    expect(pixelAt(buf, 5, 0)[0]).toBe(100)
  })

  it('clips a region that hangs over the edge instead of throwing', () => {
    const buf = makeBuffer(10, 10, (x, y) => [x * 25, y * 25, 0, 255])
    expect(() =>
      applyRegion(buf, region({ x: 6, y: 6, width: 40, height: 40, strength: 5 })),
    ).not.toThrow()
  })

  it('ignores a region entirely outside the image', () => {
    const buf = makeBuffer(10, 10, (x, y) => [x * 25, y * 25, 0, 255])
    const before = cloneBuffer(buf)
    applyRegion(buf, region({ x: 100, y: 100, width: 20, height: 20 }))
    expect(buf.data).toEqual(before.data)
  })

  it('spares the corners when the shape is an ellipse', () => {
    const buf = makeBuffer(40, 40, (x, y) =>
      (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    )
    const before = cloneBuffer(buf)
    applyRegion(
      buf,
      region({ shape: 'ellipse', x: 4, y: 4, width: 32, height: 32, strength: 10 }),
    )
    // Top-left corner of the bounding box sits outside the oval.
    expect(pixelAt(buf, 5, 5)).toEqual(pixelAt(before, 5, 5))
    expect(pixelAt(buf, 20, 20)).not.toEqual(pixelAt(before, 20, 20))
  })
})

describe('applyRegions', () => {
  const source = makeBuffer(30, 30, (x, y) =>
    (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
  )

  it('never mutates the source buffer', () => {
    const before = Uint8ClampedArray.from(source.data)
    applyRegions(source, [region({ x: 2, y: 2, width: 10, height: 10 })])
    expect(source.data).toEqual(before)
  })

  it('applies every region', () => {
    const out = applyRegions(source, [
      region({ id: 'a', x: 0, y: 0, width: 10, height: 10, strength: 8 }),
      region({ id: 'b', x: 18, y: 18, width: 10, height: 10, strength: 8 }),
    ])
    expect(pixelAt(out, 5, 5)).not.toEqual(pixelAt(source, 5, 5))
    expect(pixelAt(out, 22, 22)).not.toEqual(pixelAt(source, 22, 22))
    expect(pixelAt(out, 15, 2)).toEqual(pixelAt(source, 15, 2))
  })

  it('returns an untouched copy when there are no regions', () => {
    const out = applyRegions(source, [])
    expect(out.data).toEqual(source.data)
    expect(out.data).not.toBe(source.data)
  })
})

describe('applyRegionsInto', () => {
  it('matches applyRegions while reusing the destination buffer', () => {
    const source = makeBuffer(16, 16, (x, y) => [x * 15, y * 15, 0, 255])
    const regions = [region({ x: 2, y: 2, width: 8, height: 8, strength: 5 })]
    const scratch = createBuffer(16, 16)

    const result = applyRegionsInto(scratch, source, regions)
    expect(result).toBe(scratch)
    expect(scratch.data).toEqual(applyRegions(source, regions).data)
  })

  it('does not accumulate across calls', () => {
    const source = makeBuffer(16, 16, (x, y) => [x * 15, y * 15, 0, 255])
    const scratch = createBuffer(16, 16)
    const regions = [region({ x: 0, y: 0, width: 8, height: 8, strength: 5 })]

    applyRegionsInto(scratch, source, regions)
    const first = Uint8ClampedArray.from(scratch.data)
    applyRegionsInto(scratch, source, regions)
    expect(scratch.data).toEqual(first)
  })
})

describe('clampStrength', () => {
  it('holds blur within its range', () => {
    expect(clampStrength('blur', 0)).toBe(MIN_BLUR)
    expect(clampStrength('blur', 9999)).toBe(MAX_BLUR)
    expect(clampStrength('blur', 20)).toBe(20)
  })

  it('holds pixel size within its range', () => {
    expect(clampStrength('pixelate', 0)).toBe(MIN_PIXEL)
    expect(clampStrength('pixelate', 9999)).toBe(MAX_PIXEL)
  })

  it('rounds to whole pixels', () => {
    expect(clampStrength('blur', 12.6)).toBe(13)
  })
})
