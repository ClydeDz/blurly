import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeImage, readSurface } from '../../test/canvasMock'
import {
  MAX_PREVIEW_DIMENSION,
  ImageLoadError,
  bufferToCanvas,
  computePreviewScale,
  drawScaled,
  imageToBuffer,
  loadImageFile,
  paintBuffer,
  regionsForPreview,
  renderExport,
  triggerDownload,
} from '../render'
import type { Region } from '../types'

/** A 40x40 checkerboard — fine detail that any effect will visibly destroy. */
function checkerImage(size = 40) {
  return fakeImage(size, size, (x, y) =>
    (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
  )
}

function region(overrides: Partial<Region> = {}): Region {
  return {
    id: 'r1',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    effect: 'blur',
    shape: 'rect',
    strength: 10,
    feather: 0,
    ...overrides,
  }
}

/** Watch every toBlob call so we can inspect the canvas that was encoded. */
function spyOnEncode() {
  const calls: { width: number; height: number; type?: string; canvas: HTMLCanvasElement }[] = []
  const original = HTMLCanvasElement.prototype.toBlob
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation(function (this: HTMLCanvasElement, ...args: unknown[]) {
      calls.push({
        width: this.width,
        height: this.height,
        type: args[1] as string | undefined,
        canvas: this,
      })
      return original.apply(this, args as never)
    })
  return { calls, restore: () => spy.mockRestore() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('computePreviewScale', () => {
  it('leaves a small image at 1:1', () => {
    expect(computePreviewScale(800, 600)).toBe(1)
  })

  it('shrinks by the longest side', () => {
    expect(computePreviewScale(3200, 1000)).toBeCloseTo(MAX_PREVIEW_DIMENSION / 3200)
    expect(computePreviewScale(1000, 3200)).toBeCloseTo(MAX_PREVIEW_DIMENSION / 3200)
  })

  it('respects a custom cap', () => {
    expect(computePreviewScale(1000, 500, 500)).toBe(0.5)
  })

  it('does not divide by zero on an empty image', () => {
    expect(computePreviewScale(0, 0)).toBe(1)
  })
})

describe('imageToBuffer', () => {
  it('reads the image pixels at full size', () => {
    const buffer = imageToBuffer(checkerImage(8), 8, 8)
    expect(buffer.width).toBe(8)
    expect(buffer.height).toBe(8)
    expect(Array.from(buffer.data.slice(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(buffer.data.slice(4, 8))).toEqual([255, 255, 255, 255])
  })

  it('rasterises at a reduced size when asked', () => {
    const buffer = imageToBuffer(checkerImage(40), 40, 40, 10, 10)
    expect(buffer.width).toBe(10)
    expect(buffer.height).toBe(10)
    expect(buffer.data).toHaveLength(400)
  })
})

describe('drawScaled', () => {
  it('produces a canvas at exactly the requested size', () => {
    const canvas = drawScaled(checkerImage(64), 64, 64, 16, 16)
    expect(canvas.width).toBe(16)
    expect(canvas.height).toBe(16)
  })

  it('handles a non-uniform target', () => {
    const canvas = drawScaled(checkerImage(64), 64, 64, 40, 10)
    expect(canvas.width).toBe(40)
    expect(canvas.height).toBe(10)
  })
})

describe('bufferToCanvas / paintBuffer', () => {
  it('round-trips a buffer through a canvas', () => {
    const buffer = imageToBuffer(checkerImage(6), 6, 6)
    const canvas = bufferToCanvas(buffer)
    expect(canvas.width).toBe(6)
    expect(readSurface(canvas).data).toEqual(buffer.data)
  })

  it('resizes the target canvas to match the buffer', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    paintBuffer(canvas, imageToBuffer(checkerImage(12), 12, 12))
    expect(canvas.width).toBe(12)
    expect(canvas.height).toBe(12)
  })
})

describe('regionsForPreview', () => {
  const regions = [region({ x: 100, y: 200, width: 40, height: 40, strength: 20 })]

  it('passes regions straight through at 1:1', () => {
    expect(regionsForPreview(regions, 1)).toEqual(regions)
  })

  it('scales geometry and strength together', () => {
    const [scaled] = regionsForPreview(regions, 0.5)
    expect(scaled).toMatchObject({
      x: 50,
      y: 100,
      width: 20,
      height: 20,
      strength: 10,
    })
  })

  it('keeps the ids so selection survives', () => {
    expect(regionsForPreview(regions, 0.5)[0].id).toBe('r1')
  })
})

describe('renderExport', () => {
  it('encodes at full size for the original preset', async () => {
    const encode = spyOnEncode()
    const source = imageToBuffer(checkerImage(40), 40, 40)
    await renderExport(source, [], { scale: 1, format: 'png', quality: 0.9 })
    expect(encode.calls.at(-1)).toMatchObject({ width: 40, height: 40, type: 'image/png' })
  })

  it('encodes at 65% for the medium preset', async () => {
    const encode = spyOnEncode()
    const source = imageToBuffer(checkerImage(40), 40, 40)
    await renderExport(source, [], { scale: 0.65, format: 'png', quality: 0.9 })
    expect(encode.calls.at(-1)).toMatchObject({ width: 26, height: 26 })
  })

  it('encodes at 40% for the small preset', async () => {
    const encode = spyOnEncode()
    const source = imageToBuffer(checkerImage(40), 40, 40)
    await renderExport(source, [], { scale: 0.4, format: 'png', quality: 0.9 })
    expect(encode.calls.at(-1)).toMatchObject({ width: 16, height: 16 })
  })

  it('bakes the effect into the exported pixels', async () => {
    const encode = spyOnEncode()
    const source = imageToBuffer(checkerImage(40), 40, 40)
    await renderExport(source, [region({ x: 0, y: 0, width: 20, height: 20, strength: 12 })], {
      scale: 1,
      format: 'png',
      quality: 1,
    })

    const encoded = encode.calls.at(-1)!
    const pixels = readSurface(encoded.canvas)
    const inside = pixels.data[(10 * 40 + 10) * 4]
    const outside = pixels.data[(30 * 40 + 30) * 4]
    // Inside the region the checkerboard has averaged towards grey...
    expect(inside).toBeGreaterThan(60)
    expect(inside).toBeLessThan(195)
    // ...while outside it is still pure black or white.
    expect([0, 255]).toContain(outside)
  })

  it('still redacts after downscaling to 40%', async () => {
    const encode = spyOnEncode()
    const source = imageToBuffer(checkerImage(40), 40, 40)
    await renderExport(
      source,
      [region({ effect: 'pixelate', x: 0, y: 0, width: 40, height: 40, strength: 40 })],
      { scale: 0.4, format: 'png', quality: 1 },
    )

    const encoded = encode.calls.at(-1)!
    const pixels = readSurface(encoded.canvas)
    // One flat block covered the whole image, so every exported pixel matches.
    const first = pixels.data[0]
    for (let i = 0; i < pixels.data.length; i += 4) {
      expect(pixels.data[i]).toBe(first)
    }
  })

  it('never mutates the source buffer', async () => {
    const source = imageToBuffer(checkerImage(24), 24, 24)
    const before = Uint8ClampedArray.from(source.data)
    await renderExport(source, [region({ strength: 15 })], {
      scale: 1,
      format: 'png',
      quality: 1,
    })
    expect(source.data).toEqual(before)
  })

  it('flattens transparency onto white for JPEG', async () => {
    const encode = spyOnEncode()
    const transparent = imageToBuffer(
      fakeImage(8, 8, () => [0, 0, 0, 0]),
      8,
      8,
    )
    await renderExport(transparent, [], { scale: 1, format: 'jpeg', quality: 0.8 })

    const encoded = encode.calls.at(-1)!
    expect(encoded.type).toBe('image/jpeg')
    const pixels = readSurface(encoded.canvas)
    expect(Array.from(pixels.data.slice(0, 4))).toEqual([255, 255, 255, 255])
  })

  it('rejects when the browser cannot encode', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(null)
    })
    const source = imageToBuffer(checkerImage(8), 8, 8)
    await expect(
      renderExport(source, [], { scale: 1, format: 'png', quality: 1 }),
    ).rejects.toThrow(/could not encode/i)
  })
})

describe('triggerDownload', () => {
  it('clicks a link carrying the file name', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')

    triggerDownload(new Blob(['x']), 'holiday-blurred-small.png')

    expect(createUrl).toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
    const link = click.mock.instances[0] as HTMLAnchorElement
    expect(link.download).toBe('holiday-blurred-small.png')
    expect(link.href).toContain('blob:test')
  })

  it('removes the link from the document afterwards', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    triggerDownload(new Blob(['x']), 'a.png')
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})

describe('loadImageFile', () => {
  it('rejects a file that is not an image', async () => {
    const file = new File(['nope'], 'notes.txt', { type: 'text/plain' })
    await expect(loadImageFile(file)).rejects.toBeInstanceOf(ImageLoadError)
  })

  it('decodes via createImageBitmap when available', async () => {
    const bitmap = { ...checkerImage(32), close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))

    const loaded = await loadImageFile(
      new File(['x'], 'holiday.png', { type: 'image/png' }),
    )
    expect(loaded).toMatchObject({ width: 32, height: 32, name: 'holiday.png' })
    loaded.release()
    expect(bitmap.close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('falls back to an <img> when createImageBitmap throws', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('unsupported')
      }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    class StubImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 24
      naturalHeight = 18
      width = 24
      height = 18
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', StubImage)

    const loaded = await loadImageFile(
      new File(['x'], 'fallback.png', { type: 'image/png' }),
    )
    expect(loaded).toMatchObject({ width: 24, height: 18 })
    loaded.release()
    expect(revoke).toHaveBeenCalledWith('blob:fallback')
    vi.unstubAllGlobals()
  })
})
