/**
 * A small software 2D-canvas for jsdom, which ships no canvas at all.
 *
 * It backs every canvas with a real RGBA array and implements just enough of
 * the 2D API — drawImage (with nearest-neighbour scaling), get/put/createImageData,
 * fillRect and toBlob — that the app's real render pipeline runs unmodified
 * in tests.
 */

interface Surface {
  data: Uint8ClampedArray
  width: number
  height: number
}

const surfaces = new WeakMap<object, Surface>()

/** Anything we can read pixels out of: a mock canvas, or a `fakeImage`. */
export type DrawableSource = object & { width: number; height: number }

/**
 * A `fakeImage` stands in for an ImageBitmap, so it is typed as one — the app
 * only ever passes it to drawImage, which the mock below implements.
 */
export type FakeImage = CanvasImageSource & { width: number; height: number }

function surfaceFor(target: DrawableSource): Surface {
  const existing = surfaces.get(target)
  if (
    existing &&
    existing.width === target.width &&
    existing.height === target.height
  ) {
    return existing
  }
  const surface: Surface = {
    data: new Uint8ClampedArray(target.width * target.height * 4),
    width: target.width,
    height: target.height,
  }
  surfaces.set(target, surface)
  return surface
}

/** Build a stand-in for an <img>/ImageBitmap with known pixels. */
export function fakeImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): FakeImage {
  const source = { width, height }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  surfaces.set(source, { data, width, height })
  return source as unknown as FakeImage
}

function parseColor(color: unknown): [number, number, number, number] {
  if (typeof color !== 'string') return [0, 0, 0, 255]
  const hex = color.trim().replace('#', '')
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      255,
    ]
  }
  return [0, 0, 0, 255]
}

class MockContext2D {
  fillStyle: string = '#000000'
  strokeStyle: string = '#000000'
  lineWidth = 1
  globalAlpha = 1
  imageSmoothingEnabled = true
  imageSmoothingQuality = 'low'
  font = ''
  canvas: DrawableSource

  constructor(canvas: DrawableSource) {
    this.canvas = canvas
  }

  private get surface(): Surface {
    return surfaceFor(this.canvas)
  }

  drawImage(source: DrawableSource, ...args: number[]): void {
    const dest = this.surface
    const src = surfaceFor(source)
    const [dx, dy, dw, dh] =
      args.length >= 4
        ? [args[0], args[1], args[2], args[3]]
        : [args[0] ?? 0, args[1] ?? 0, src.width, src.height]

    for (let y = 0; y < dh; y += 1) {
      const sy = Math.min(src.height - 1, Math.floor((y / dh) * src.height))
      const ty = Math.round(dy) + y
      if (ty < 0 || ty >= dest.height) continue
      for (let x = 0; x < dw; x += 1) {
        const sx = Math.min(src.width - 1, Math.floor((x / dw) * src.width))
        const tx = Math.round(dx) + x
        if (tx < 0 || tx >= dest.width) continue
        const si = (sy * src.width + sx) * 4
        const ti = (ty * dest.width + tx) * 4

        // Real drawImage composites source-over; a raw copy would wrongly
        // punch transparent holes through whatever is already painted.
        const sa = (src.data[si + 3] / 255) * this.globalAlpha
        if (sa >= 1) {
          dest.data[ti] = src.data[si]
          dest.data[ti + 1] = src.data[si + 1]
          dest.data[ti + 2] = src.data[si + 2]
          dest.data[ti + 3] = src.data[si + 3]
          continue
        }
        const da = dest.data[ti + 3] / 255
        const outA = sa + da * (1 - sa)
        if (outA === 0) {
          dest.data[ti] = 0
          dest.data[ti + 1] = 0
          dest.data[ti + 2] = 0
          dest.data[ti + 3] = 0
          continue
        }
        for (let c = 0; c < 3; c += 1) {
          dest.data[ti + c] =
            (src.data[si + c] * sa + dest.data[ti + c] * da * (1 - sa)) / outA
        }
        dest.data[ti + 3] = outA * 255
      }
    }
  }

  createImageData(width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4), width, height }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    const surface = this.surface
    const out = new Uint8ClampedArray(sw * sh * 4)
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const src = ((sy + y) * surface.width + (sx + x)) * 4
        const dst = (y * sw + x) * 4
        out[dst] = surface.data[src]
        out[dst + 1] = surface.data[src + 1]
        out[dst + 2] = surface.data[src + 2]
        out[dst + 3] = surface.data[src + 3]
      }
    }
    return { data: out, width: sw, height: sh }
  }

  putImageData(
    imageData: { data: Uint8ClampedArray; width: number; height: number },
    dx: number,
    dy: number,
  ): void {
    const surface = this.surface
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const ty = dy + y
        const tx = dx + x
        if (ty < 0 || ty >= surface.height || tx < 0 || tx >= surface.width) {
          continue
        }
        const src = (y * imageData.width + x) * 4
        const dst = (ty * surface.width + tx) * 4
        surface.data[dst] = imageData.data[src]
        surface.data[dst + 1] = imageData.data[src + 1]
        surface.data[dst + 2] = imageData.data[src + 2]
        surface.data[dst + 3] = imageData.data[src + 3]
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const surface = this.surface
    const [r, g, b, a] = parseColor(this.fillStyle)
    for (let py = Math.max(0, y); py < Math.min(surface.height, y + h); py += 1) {
      for (let px = Math.max(0, x); px < Math.min(surface.width, x + w); px += 1) {
        const i = (py * surface.width + px) * 4
        surface.data[i] = r
        surface.data[i + 1] = g
        surface.data[i + 2] = b
        surface.data[i + 3] = a
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const previous = this.fillStyle
    this.fillStyle = '#000000'
    const surface = this.surface
    for (let py = Math.max(0, y); py < Math.min(surface.height, y + h); py += 1) {
      for (let px = Math.max(0, x); px < Math.min(surface.width, x + w); px += 1) {
        surface.data.fill(0, (py * surface.width + px) * 4, (py * surface.width + px) * 4 + 4)
      }
    }
    this.fillStyle = previous
  }

  // No-ops: the app uses these for chrome that tests never assert on.
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  rect(): void {}
  ellipse(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  clip(): void {}
  translate(): void {}
  scale(): void {}
  setLineDash(): void {}
  measureText() {
    return { width: 0 }
  }
  fillText(): void {}
}

/** Patch HTMLCanvasElement so the real pipeline runs under jsdom. */
export function installCanvasMock(): void {
  const contexts = new WeakMap<HTMLCanvasElement, MockContext2D>()

  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== '2d') return null
    let ctx = contexts.get(this)
    if (!ctx) {
      ctx = new MockContext2D(this as unknown as DrawableSource)
      contexts.set(this, ctx)
    }
    return ctx as unknown as CanvasRenderingContext2D
  } as HTMLCanvasElement['getContext']

  HTMLCanvasElement.prototype.toBlob = function toBlob(
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ) {
    const surface = surfaceFor(this as unknown as DrawableSource)
    // Not a real encode — just enough bytes for size assertions to be sane.
    callback(
      new Blob([surface.data.slice(0, Math.min(surface.data.length, 4096))], {
        type: type ?? 'image/png',
      }),
    )
  }

  HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
    return 'data:image/png;base64,'
  }
}

/** Read the pixels currently on a canvas (or fake image), for assertions. */
export function readSurface(target: object): Surface {
  return surfaceFor(target as DrawableSource)
}
