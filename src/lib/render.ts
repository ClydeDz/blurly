import { applyRegions } from './effects'
import { scaleRegion } from './geometry'
import { MIME_BY_FORMAT, qualityArg, scaledDimensions } from './export'
import type { ExportFormat, PixelBuffer, Region } from './types'

/** Live preview never processes more than this many pixels on a side. */
export const MAX_PREVIEW_DIMENSION = 1600

export interface LoadedImage {
  source: CanvasImageSource
  width: number
  height: number
  name: string
  type: string
  size: number
  /** Call when the image is discarded, to release any object URL. */
  release: () => void
}

export class ImageLoadError extends Error {}

/** Decode a user-picked file into something a canvas can draw. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageLoadError(`"${file.name}" is not an image file.`)
  }

  const meta = { name: file.name, type: file.type, size: file.size }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        ...meta,
        release: () => bitmap.close?.(),
      }
    } catch {
      // Fall through to the <img> path — some browsers refuse odd formats here.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () =>
        reject(new ImageLoadError(`Could not decode "${file.name}".`))
      el.src = url
    })
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      ...meta,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This browser does not support 2D canvas.')
  return ctx
}

/** How much to shrink an image before it is used for the live preview. */
export function computePreviewScale(
  width: number,
  height: number,
  maxDimension = MAX_PREVIEW_DIMENSION,
): number {
  const longest = Math.max(width, height)
  if (longest <= maxDimension || longest === 0) return 1
  return maxDimension / longest
}

/**
 * Downscale in halving steps. Browsers blur badly on a single big downscale,
 * so this keeps large reductions crisp.
 */
export function drawScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  let currentWidth = sourceWidth
  let currentHeight = sourceHeight
  let current: CanvasImageSource = source

  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2))
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2))
    const step = createCanvas(nextWidth, nextHeight)
    const stepCtx = context2d(step)
    stepCtx.imageSmoothingEnabled = true
    stepCtx.imageSmoothingQuality = 'high'
    stepCtx.drawImage(current, 0, 0, nextWidth, nextHeight)
    current = step
    currentWidth = nextWidth
    currentHeight = nextHeight
  }

  const out = createCanvas(targetWidth, targetHeight)
  const ctx = context2d(out)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(current, 0, 0, targetWidth, targetHeight)
  return out
}

/** Rasterise an image source into a raw RGBA buffer at the given size. */
export function imageToBuffer(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth = sourceWidth,
  targetHeight = sourceHeight,
): PixelBuffer {
  const canvas =
    targetWidth === sourceWidth && targetHeight === sourceHeight
      ? (() => {
          const c = createCanvas(targetWidth, targetHeight)
          context2d(c).drawImage(source, 0, 0)
          return c
        })()
      : drawScaled(source, sourceWidth, sourceHeight, targetWidth, targetHeight)

  const imageData = context2d(canvas).getImageData(
    0,
    0,
    targetWidth,
    targetHeight,
  )
  return {
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  }
}

export function bufferToCanvas(buf: PixelBuffer): HTMLCanvasElement {
  const canvas = createCanvas(buf.width, buf.height)
  const ctx = context2d(canvas)
  const imageData = ctx.createImageData(buf.width, buf.height)
  imageData.data.set(buf.data)
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Paint a buffer into an existing on-screen canvas, resizing it to match. */
export function paintBuffer(
  canvas: HTMLCanvasElement,
  buf: PixelBuffer,
): void {
  if (canvas.width !== buf.width) canvas.width = buf.width
  if (canvas.height !== buf.height) canvas.height = buf.height
  const ctx = context2d(canvas)
  const imageData = ctx.createImageData(buf.width, buf.height)
  imageData.data.set(buf.data)
  ctx.putImageData(imageData, 0, 0)
}

/** Regions live in full-res image space; map them onto the preview buffer. */
export function regionsForPreview(
  regions: readonly Region[],
  previewScale: number,
): Region[] {
  if (previewScale === 1) return [...regions]
  return regions.map((region) => scaleRegion(region, previewScale))
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The browser could not encode this image.'))
      },
      MIME_BY_FORMAT[format],
      qualityArg(format, quality),
    )
  })
}

export interface ExportOptions {
  scale: number
  format: ExportFormat
  quality: number
}

/**
 * Apply every region at full resolution, then downscale. Doing it in that
 * order means a 40% export is still redacted, just smaller.
 */
export async function renderExport(
  sourceBuffer: PixelBuffer,
  regions: readonly Region[],
  { scale, format, quality }: ExportOptions,
): Promise<Blob> {
  const processed = applyRegions(sourceBuffer, regions)
  const full = bufferToCanvas(processed)

  const target = scaledDimensions(processed.width, processed.height, scale)
  const canvas =
    scale === 1
      ? full
      : drawScaled(
          full,
          processed.width,
          processed.height,
          target.width,
          target.height,
        )

  // JPEG has no alpha — flatten onto white so transparency isn't rendered black.
  if (format === 'jpeg') {
    const flat = createCanvas(canvas.width, canvas.height)
    const ctx = context2d(flat)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, flat.width, flat.height)
    ctx.drawImage(canvas, 0, 0)
    return canvasToBlob(flat, format, quality)
  }

  return canvasToBlob(canvas, format, quality)
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before we revoke.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
