import { describe, expect, it } from 'vitest'
import {
  clamp,
  clampRectToBounds,
  displayToImage,
  fitToBox,
  hitTest,
  moveRectWithin,
  normalizeRect,
  rectArea,
  rectContains,
  rectFromPoints,
  resizeRect,
  roundRect,
  scaleRect,
  scaleRegion,
} from '../geometry'

describe('rectFromPoints / normalizeRect', () => {
  it('builds a positive-area rect from any corner order', () => {
    expect(rectFromPoints(30, 40, 10, 10)).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 30,
    })
  })

  it('flips negative width and height', () => {
    expect(normalizeRect({ x: 30, y: 30, width: -20, height: -10 })).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 10,
    })
  })

  it('leaves an already-normal rect alone', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 }
    expect(normalizeRect(rect)).toEqual(rect)
  })
})

describe('clamp', () => {
  it('bounds a value on both sides', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe('clampRectToBounds', () => {
  it('clips a rect that hangs off the edges', () => {
    expect(clampRectToBounds({ x: -10, y: -5, width: 40, height: 40 }, 20, 20)
    ).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })

  it('snaps fractional edges outward to whole pixels', () => {
    expect(
      clampRectToBounds({ x: 2.4, y: 3.7, width: 5.2, height: 4.1 }, 100, 100),
    ).toEqual({ x: 2, y: 3, width: 6, height: 5 })
  })

  it('returns null when the rect is entirely outside', () => {
    expect(clampRectToBounds({ x: 50, y: 50, width: 10, height: 10 }, 20, 20)).toBeNull()
  })

  it('returns null for a zero-area rect', () => {
    expect(clampRectToBounds({ x: 5, y: 5, width: 0, height: 10 }, 20, 20)).toBeNull()
  })
})

describe('scaleRect / scaleRegion', () => {
  it('scales every dimension', () => {
    expect(scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 0.5)).toEqual({
      x: 5,
      y: 10,
      width: 15,
      height: 20,
    })
  })

  it('scales strength alongside the rect so previews match exports', () => {
    const scaled = scaleRegion(
      { x: 10, y: 10, width: 20, height: 20, strength: 40 },
      0.25,
    )
    expect(scaled).toMatchObject({ x: 2.5, y: 2.5, width: 5, height: 5, strength: 10 })
  })

  it('never lets strength fall below 1', () => {
    expect(
      scaleRegion({ x: 0, y: 0, width: 4, height: 4, strength: 2 }, 0.1).strength,
    ).toBe(1)
  })
})

describe('rectContains / hitTest', () => {
  const regions = [
    { id: 'a', x: 0, y: 0, width: 50, height: 50 },
    { id: 'b', x: 20, y: 20, width: 50, height: 50 },
  ]

  it('detects points inside and outside', () => {
    expect(rectContains(regions[0], 10, 10)).toBe(true)
    expect(rectContains(regions[0], 60, 10)).toBe(false)
  })

  it('prefers the region drawn last where they overlap', () => {
    expect(hitTest(regions, 30, 30)?.id).toBe('b')
  })

  it('falls through to the lower region outside the overlap', () => {
    expect(hitTest(regions, 5, 5)?.id).toBe('a')
  })

  it('returns null on empty space', () => {
    expect(hitTest(regions, 200, 200)).toBeNull()
  })
})

describe('rectArea', () => {
  it('is always positive', () => {
    expect(rectArea({ x: 0, y: 0, width: -4, height: 5 })).toBe(20)
  })
})

describe('fitToBox', () => {
  it('shrinks a large image to fit', () => {
    expect(fitToBox(1000, 500, 400, 400)).toEqual({
      width: 400,
      height: 200,
      scale: 0.4,
    })
  })

  it('constrains by height when that is the tighter axis', () => {
    expect(fitToBox(500, 1000, 400, 400)).toEqual({
      width: 200,
      height: 400,
      scale: 0.4,
    })
  })

  it('never upscales past 1:1', () => {
    expect(fitToBox(100, 100, 900, 900).scale).toBe(1)
  })

  it('handles a zero-sized image without dividing by zero', () => {
    expect(fitToBox(0, 0, 500, 500)).toEqual({ width: 0, height: 0, scale: 1 })
  })
})

describe('displayToImage', () => {
  it('divides by the display scale', () => {
    expect(displayToImage({ x: 50, y: 25 }, 0.5)).toEqual({ x: 100, y: 50 })
  })

  it('treats a zero scale as 1:1 rather than exploding', () => {
    expect(displayToImage({ x: 7, y: 9 }, 0)).toEqual({ x: 7, y: 9 })
  })
})

describe('roundRect', () => {
  it('rounds to whole pixels while keeping the size', () => {
    expect(roundRect({ x: 1.4, y: 2.6, width: 5.1, height: 4.2 })).toEqual({
      x: 1,
      y: 3,
      width: 6,
      height: 4,
    })
  })
})

describe('resizeRect', () => {
  const origin = { x: 100, y: 100, width: 100, height: 100 }

  it('drags the north-west corner', () => {
    expect(resizeRect(origin, 'nw', -20, -30)).toEqual({
      x: 80,
      y: 70,
      width: 120,
      height: 130,
    })
  })

  it('drags the south-east corner', () => {
    expect(resizeRect(origin, 'se', 25, 25)).toEqual({
      x: 100,
      y: 100,
      width: 125,
      height: 125,
    })
  })

  it('moves only one axis for an edge handle', () => {
    expect(resizeRect(origin, 'e', 40, 999)).toEqual({
      x: 100,
      y: 100,
      width: 140,
      height: 100,
    })
    expect(resizeRect(origin, 'n', 999, -10)).toEqual({
      x: 100,
      y: 90,
      width: 100,
      height: 110,
    })
  })

  it('flips rather than inverting when dragged past the far edge', () => {
    expect(resizeRect(origin, 'w', 150, 0)).toEqual({
      x: 200,
      y: 100,
      width: 50,
      height: 100,
    })
  })
})

describe('moveRectWithin', () => {
  it('translates by the delta', () => {
    expect(moveRectWithin({ x: 10, y: 10, width: 20, height: 20 }, 5, -5, 100, 100))
      .toMatchObject({ x: 15, y: 5 })
  })

  it('stops at the top-left corner', () => {
    expect(moveRectWithin({ x: 5, y: 5, width: 20, height: 20 }, -50, -50, 100, 100))
      .toMatchObject({ x: 0, y: 0 })
  })

  it('stops at the bottom-right corner', () => {
    expect(
      moveRectWithin({ x: 50, y: 50, width: 20, height: 20 }, 999, 999, 100, 100),
    ).toMatchObject({ x: 80, y: 80 })
  })

  it('pins a rect larger than the image at the origin', () => {
    expect(moveRectWithin({ x: 0, y: 0, width: 200, height: 200 }, 30, 30, 100, 100))
      .toMatchObject({ x: 0, y: 0 })
  })
})
