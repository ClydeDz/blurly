/** Effect applied to a region. */
export type EffectKind = 'blur' | 'pixelate'

/** Outline of the masked area. */
export type Shape = 'rect' | 'ellipse'

/** A rectangle in *image* pixel coordinates. x/y is the top-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A single redaction the user has drawn onto the image. */
export interface Region extends Rect {
  id: string
  effect: EffectKind
  shape: Shape
  /** Blur radius in px, or pixel block size in px, depending on `effect`. */
  strength: number
  /** 0 = hard edge, 1 = maximally soft edge. */
  feather: number
}

/** Settings applied to the next region drawn, and to the selected one. */
export type EffectSettings = Pick<Region, 'effect' | 'shape' | 'strength' | 'feather'>

/** A minimal, canvas-free stand-in for `ImageData`. */
export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type SizeKey = 'original' | 'medium' | 'small'

export interface SizePreset {
  key: SizeKey
  label: string
  /** Multiplier applied to the source image's dimensions. */
  scale: number
  blurb: string
}

export type ExportFormat = 'png' | 'jpeg' | 'webp'
