export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'blurly:theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * The theme to start on: a previous explicit choice if there is one,
 * otherwise whatever the operating system is set to.
 */
export function initialTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (isTheme(stored)) return stored
  return prefersDark ? 'dark' : 'light'
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

/** Reading localStorage throws in some privacy modes, so it stays guarded. */
export function readStoredTheme(): string | null {
  try {
    return globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A theme that doesn't persist is better than a page that won't load.
  }
}

export function prefersDarkScheme(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  } catch {
    return false
  }
}
