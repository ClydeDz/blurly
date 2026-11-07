import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  MIN_REGION_SIZE,
  createRegion,
  describeRegion,
  fitRegionToImage,
  isRegionUsable,
  nextRegionId,
  removeRegion,
  resetRegionIds,
  updateRegion,
} from '../regions'
import { MAX_PIXEL } from '../effects'
import type { Region } from '../types'

beforeEach(() => {
  resetRegionIds()
})

describe('nextRegionId', () => {
  it('hands out unique ids', () => {
    expect(nextRegionId()).toBe('region-1')
    expect(nextRegionId()).toBe('region-2')
  })
})

describe('isRegionUsable', () => {
  it('rejects a stray click', () => {
    expect(isRegionUsable({ x: 0, y: 0, width: 0, height: 0 })).toBe(false)
    expect(isRegionUsable({ x: 0, y: 0, width: 2, height: 40 })).toBe(false)
  })

  it('accepts anything at or above the minimum size', () => {
    expect(
      isRegionUsable({
        x: 0,
        y: 0,
        width: MIN_REGION_SIZE,
        height: MIN_REGION_SIZE,
      }),
    ).toBe(true)
  })

  it('judges a backwards drag on its absolute size', () => {
    expect(isRegionUsable({ x: 50, y: 50, width: -30, height: -30 })).toBe(true)
  })
})

describe('fitRegionToImage', () => {
  it('leaves an in-bounds rect alone', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 }
    expect(fitRegionToImage(rect, 100, 100)).toEqual(rect)
  })

  it('trims a rect that overhangs the right and bottom', () => {
    expect(fitRegionToImage({ x: 90, y: 90, width: 40, height: 40 }, 100, 100))
      .toEqual({ x: 90, y: 90, width: 10, height: 10 })
  })

  it('pulls a negative origin back to zero', () => {
    expect(fitRegionToImage({ x: -20, y: -20, width: 50, height: 50 }, 100, 100))
      .toEqual({ x: 0, y: 0, width: 30, height: 30 })
  })

  it('normalizes a backwards drag first', () => {
    expect(fitRegionToImage({ x: 60, y: 60, width: -30, height: -30 }, 100, 100))
      .toEqual({ x: 30, y: 30, width: 30, height: 30 })
  })
})

describe('createRegion', () => {
  it('captures the current settings', () => {
    const region = createRegion(
      { x: 5, y: 5, width: 20, height: 10 },
      { effect: 'pixelate', shape: 'ellipse', strength: 24, feather: 0.4 },
    )
    expect(region).toMatchObject({
      id: 'region-1',
      x: 5,
      y: 5,
      width: 20,
      height: 10,
      effect: 'pixelate',
      shape: 'ellipse',
      strength: 24,
      feather: 0.4,
    })
  })

  it('normalizes a rect drawn right-to-left', () => {
    const region = createRegion({ x: 40, y: 40, width: -20, height: -10 }, DEFAULT_SETTINGS)
    expect(region).toMatchObject({ x: 20, y: 30, width: 20, height: 10 })
  })

  it('clamps out-of-range strength and feather', () => {
    const region = createRegion(
      { x: 0, y: 0, width: 10, height: 10 },
      { effect: 'pixelate', shape: 'rect', strength: 5000, feather: 4 },
    )
    expect(region.strength).toBe(MAX_PIXEL)
    expect(region.feather).toBe(1)
  })
})

describe('updateRegion / removeRegion', () => {
  const regions: Region[] = [
    { id: 'a', x: 0, y: 0, width: 10, height: 10, effect: 'blur', shape: 'rect', strength: 10, feather: 0 },
    { id: 'b', x: 5, y: 5, width: 10, height: 10, effect: 'blur', shape: 'rect', strength: 10, feather: 0 },
  ]

  it('patches only the matching region', () => {
    const next = updateRegion(regions, 'b', { strength: 42 })
    expect(next[1].strength).toBe(42)
    expect(next[0].strength).toBe(10)
  })

  it('does not mutate the input array', () => {
    updateRegion(regions, 'a', { strength: 99 })
    expect(regions[0].strength).toBe(10)
  })

  it('is a no-op for an unknown id', () => {
    expect(updateRegion(regions, 'zzz', { strength: 1 })).toEqual(regions)
  })

  it('removes by id', () => {
    expect(removeRegion(regions, 'a').map((region) => region.id)).toEqual(['b'])
  })
})

describe('describeRegion', () => {
  const base: Region = {
    id: 'a',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    effect: 'blur',
    shape: 'rect',
    strength: 18,
    feather: 0,
  }

  it('describes a blurred box', () => {
    expect(describeRegion(base)).toBe('Box · Blur 18px radius')
  })

  it('describes a pixelated oval', () => {
    expect(
      describeRegion({ ...base, effect: 'pixelate', shape: 'ellipse', strength: 12 }),
    ).toBe('Oval · Pixelate 12px blocks')
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('starts on a sensible blur', () => {
    expect(DEFAULT_SETTINGS.effect).toBe('blur')
    expect(DEFAULT_SETTINGS.shape).toBe('rect')
    expect(DEFAULT_SETTINGS.strength).toBeGreaterThan(0)
  })
})
