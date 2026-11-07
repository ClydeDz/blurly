import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import ControlPanel from './components/ControlPanel'
import Icon from './components/Icon'
import DownloadPanel from './components/DownloadPanel'
import Dropzone from './components/Dropzone'
import EditorCanvas from './components/EditorCanvas'
import { applyRegionsInto, clampStrength, createBuffer } from './lib/effects'
import { buildFileName, formatBytes, getPreset } from './lib/export'
import {
  DEFAULT_SETTINGS,
  createRegion,
  removeRegion,
  updateRegion,
} from './lib/regions'
import {
  initialTheme,
  otherTheme,
  prefersDarkScheme,
  readStoredTheme,
  storeTheme,
  type Theme,
} from './lib/theme'
import {
  computePreviewScale,
  imageToBuffer,
  loadImageFile,
  paintBuffer,
  regionsForPreview,
  renderExport,
  triggerDownload,
  type LoadedImage,
} from './lib/render'
import type {
  EffectSettings,
  ExportFormat,
  PixelBuffer,
  Rect,
  Region,
  SizeKey,
} from './lib/types'

interface HistoryState {
  regions: Region[]
  past: Region[][]
  future: Region[][]
}

type HistoryAction =
  | { type: 'set'; regions: Region[] }
  | { type: 'commit'; regions: Region[] }
  | { type: 'snapshot' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }

const HISTORY_LIMIT = 50
const EMPTY_HISTORY: HistoryState = { regions: [], past: [], future: [] }

function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.type) {
    case 'set':
      return { ...state, regions: action.regions }
    case 'snapshot':
      return {
        ...state,
        past: [...state.past, state.regions].slice(-HISTORY_LIMIT),
        future: [],
      }
    case 'commit':
      return {
        regions: action.regions,
        past: [...state.past, state.regions].slice(-HISTORY_LIMIT),
        future: [],
      }
    case 'undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        regions: previous,
        past: state.past.slice(0, -1),
        future: [state.regions, ...state.future],
      }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        regions: next,
        past: [...state.past, state.regions],
        future: rest,
      }
    }
    case 'reset':
      return EMPTY_HISTORY
    default:
      return state
  }
}

interface Buffers {
  source: PixelBuffer
  preview: PixelBuffer
  scratch: PixelBuffer
  previewScale: number
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<LoadedImage | null>(null)

  const [image, setImage] = useState<LoadedImage | null>(null)
  const [buffers, setBuffers] = useState<Buffers | null>(null)
  const [history, dispatch] = useReducer(historyReducer, EMPTY_HISTORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settings, setSettings] = useState<EffectSettings>(DEFAULT_SETTINGS)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(0.92)
  const [busyKey, setBusyKey] = useState<SizeKey | null>(null)
  const [lastSaved, setLastSaved] = useState<{
    key: SizeKey
    size: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [theme, setTheme] = useState<Theme>(() =>
    initialTheme(readStoredTheme(), prefersDarkScheme()),
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = otherTheme(current)
      storeTheme(next)
      return next
    })
  }, [])

  const { regions, past, future } = history

  const openFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const loaded = await loadImageFile(file)
      const previewScale = computePreviewScale(loaded.width, loaded.height)
      const source = imageToBuffer(loaded.source, loaded.width, loaded.height)
      const preview =
        previewScale === 1
          ? source
          : imageToBuffer(
              loaded.source,
              loaded.width,
              loaded.height,
              Math.max(1, Math.round(loaded.width * previewScale)),
              Math.max(1, Math.round(loaded.height * previewScale)),
            )

      imageRef.current?.release()
      imageRef.current = loaded
      setImage(loaded)
      setBuffers({
        source,
        preview,
        scratch: createBuffer(preview.width, preview.height),
        previewScale,
      })
      dispatch({ type: 'reset' })
      setSelectedId(null)
      setLastSaved(null)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Something went wrong opening that image.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Re-paint the preview whenever the picture or the regions change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!buffers || !canvas) return undefined
    const frame = requestAnimationFrame(() => {
      const processed = applyRegionsInto(
        buffers.scratch,
        buffers.preview,
        regionsForPreview(regions, buffers.previewScale),
      )
      paintBuffer(canvas, processed)
    })
    return () => cancelAnimationFrame(frame)
  }, [buffers, regions])

  useEffect(() => () => imageRef.current?.release(), [])

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) {
        event.preventDefault()
        void openFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openFile])

  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedId) ?? null,
    [regions, selectedId],
  )

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      const region = regions.find((item) => item.id === id)
      if (region) {
        setSettings({
          effect: region.effect,
          shape: region.shape,
          strength: region.strength,
          feather: region.feather,
        })
      }
    },
    [regions],
  )

  const handleSettingsChange = useCallback(
    (patch: Partial<EffectSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch }
        next.strength = clampStrength(next.effect, next.strength)
        return next
      })
      if (!selectedId) return
      dispatch({ type: 'snapshot' })
      dispatch({
        type: 'set',
        regions: updateRegion(regions, selectedId, {
          ...patch,
          ...(patch.effect || patch.strength !== undefined
            ? {
                strength: clampStrength(
                  patch.effect ?? settings.effect,
                  patch.strength ?? settings.strength,
                ),
              }
            : {}),
        }),
      })
    },
    [regions, selectedId, settings.effect, settings.strength],
  )

  const handleCreate = useCallback(
    (rect: Rect) => {
      const region = createRegion(rect, settings)
      dispatch({ type: 'commit', regions: [...regions, region] })
      setSelectedId(region.id)
    },
    [regions, settings],
  )

  const handleUpdate = useCallback(
    (id: string, rect: Rect) => {
      dispatch({ type: 'set', regions: updateRegion(regions, id, rect) })
    },
    [regions],
  )

  const handleRemove = useCallback(
    (id: string) => {
      dispatch({ type: 'commit', regions: removeRegion(regions, id) })
      setSelectedId((current) => (current === id ? null : current))
    },
    [regions],
  )

  const handleClear = useCallback(() => {
    dispatch({ type: 'commit', regions: [] })
    setSelectedId(null)
  }, [])

  const handleSnapshot = useCallback(() => dispatch({ type: 'snapshot' }), [])

  // Global shortcuts: undo/redo, delete the selection, dismiss the selection.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (event.key === 'Escape') {
        setSelectedId(null)
        return
      }
      if (
        !typing &&
        selectedId &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        event.preventDefault()
        handleRemove(selectedId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRemove, selectedId])

  const handleDownload = useCallback(
    async (key: SizeKey) => {
      if (!buffers || !image) return
      setBusyKey(key)
      setError(null)
      // Yield once so the button can show its busy state before we block.
      await new Promise((resolve) => setTimeout(resolve, 0))
      try {
        const blob = await renderExport(buffers.source, regions, {
          scale: getPreset(key).scale,
          format,
          quality,
        })
        triggerDownload(blob, buildFileName(image.name, key, format))
        setLastSaved({ key, size: formatBytes(blob.size) })
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not export the image.',
        )
      } finally {
        setBusyKey(null)
      }
    },
    [buffers, format, image, quality, regions],
  )

  const handleStartOver = useCallback(() => {
    imageRef.current?.release()
    imageRef.current = null
    setImage(null)
    setBuffers(null)
    dispatch({ type: 'reset' })
    setSelectedId(null)
    setLastSaved(null)
    setError(null)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <Icon name="aperture" size={18} />
          </span>
          <span className="brand__text">
            <strong>Blurly</strong>
            <small>Hide anything, in your browser</small>
          </span>
        </div>
        <div className="topbar__actions">
          <span className="chip" title="No image ever leaves this device">
            <Icon name="shield" size={13} /> Stays on your device
          </span>
          {image && (
            <>
              <Dropzone onFile={openFile} compact />
              <button type="button" className="btn" onClick={handleStartOver}>
                Start over
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${otherTheme(theme)} theme`}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          <Icon name="alert" size={16} />
          <p>{error}</p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <main className="app__main">
        {!image || !buffers ? (
          <div className="landing">
            <h1 className="landing__title">
              Blur or pixelate <em>any part</em> of an image
            </h1>
            <p className="landing__lede">
              Drag a box over a face, an address, a card number — pick your
              effect, then download it at full size or scaled down. Nothing is
              uploaded anywhere.
            </p>
            <Dropzone onFile={openFile} />
            {isLoading && <p className="save-status">Opening your image…</p>}
          </div>
        ) : (
          <div className="editor">
            <EditorCanvas
              canvasRef={canvasRef}
              imageWidth={buffers.source.width}
              imageHeight={buffers.source.height}
              regions={regions}
              selectedId={selectedId}
              settings={settings}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onInteractionStart={handleSnapshot}
            />

            <aside className="sidebar">
              <div className="meta-card" data-testid="image-meta">
                <p className="meta-card__name" title={image.name}>
                  {image.name}
                </p>
                <p className="meta-card__dims">
                  {buffers.source.width} × {buffers.source.height} ·{' '}
                  {formatBytes(image.size)}
                </p>
                {selectedRegion && (
                  <p className="meta-card__hint">
                    Editing area {regions.indexOf(selectedRegion) + 1} — the
                    sliders below change it live.
                  </p>
                )}
              </div>

              <ControlPanel
                settings={settings}
                regions={regions}
                selectedId={selectedId}
                canUndo={past.length > 0}
                canRedo={future.length > 0}
                onSettingsChange={handleSettingsChange}
                onSelect={handleSelect}
                onRemove={handleRemove}
                onClear={handleClear}
                onUndo={() => dispatch({ type: 'undo' })}
                onRedo={() => dispatch({ type: 'redo' })}
              />

              <DownloadPanel
                imageWidth={buffers.source.width}
                imageHeight={buffers.source.height}
                format={format}
                quality={quality}
                busyKey={busyKey}
                lastSaved={lastSaved}
                onFormatChange={setFormat}
                onQualityChange={setQuality}
                onDownload={handleDownload}
              />
            </aside>
          </div>
        )}
      </main>

      <footer className="footer">
        {image && (
          <p>
            Drag to draw · arrow keys to nudge · <kbd>⌫</kbd> to delete ·{' '}
            <kbd>⌘Z</kbd> to undo
          </p>
        )}
      </footer>
    </div>
  )
}
