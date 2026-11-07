import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  initialTheme,
  otherTheme,
  prefersDarkScheme,
  readStoredTheme,
  storeTheme,
} from '../theme'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('initialTheme', () => {
  it('honours a stored choice over the system setting', () => {
    expect(initialTheme('light', true)).toBe('light')
    expect(initialTheme('dark', false)).toBe('dark')
  })

  it('falls back to the system setting when nothing is stored', () => {
    expect(initialTheme(null, true)).toBe('dark')
    expect(initialTheme(null, false)).toBe('light')
  })

  it('ignores a stored value that is not a theme', () => {
    expect(initialTheme('neon', true)).toBe('dark')
    expect(initialTheme('', false)).toBe('light')
  })
})

describe('otherTheme', () => {
  it('flips between the two themes', () => {
    expect(otherTheme('light')).toBe('dark')
    expect(otherTheme('dark')).toBe('light')
  })
})

describe('storage', () => {
  it('round-trips a stored theme', () => {
    storeTheme('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readStoredTheme()).toBe('dark')
  })

  it('returns null when nothing has been stored', () => {
    expect(readStoredTheme()).toBeNull()
  })

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readStoredTheme()).toBeNull()
    expect(() => storeTheme('dark')).not.toThrow()
  })
})

describe('prefersDarkScheme', () => {
  it('reports what the media query says', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(prefersDarkScheme()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(prefersDarkScheme()).toBe(false)
  })

  it('defaults to light when the query is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersDarkScheme()).toBe(false)
  })
})
