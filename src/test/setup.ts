import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { installCanvasMock } from './canvasMock'

installCanvasMock()

// jsdom implements neither of these; the app uses both for downloads.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn()
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia
}

afterEach(() => {
  cleanup()
})
