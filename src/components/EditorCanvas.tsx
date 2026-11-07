import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  HANDLES,
  clampRectToBounds,
  fitToBox,
  moveRectWithin,
  rectFromPoints,
  resizeRect,
  type Handle,
} from '../lib/geometry'
import { fitRegionToImage, isRegionUsable } from '../lib/regions'
import type { EffectSettings, Rect, Region } from '../lib/types'

type Drag =
  | { mode: 'create'; startX: number; startY: number }
  | { mode: 'move'; id: string; origin: Rect; startX: number; startY: number }
  | {
      mode: 'resize'
      id: string
      origin: Rect
      handle: Handle
      startX: number
      startY: number
    }

interface EditorCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  imageWidth: number
  imageHeight: number
  regions: readonly Region[]
  selectedId: string | null
  settings: EffectSettings
  onSelect: (id: string | null) => void
  onCreate: (rect: Rect) => void
  onUpdate: (id: string, rect: Rect) => void
  onInteractionStart: () => void
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

function percent(value: number, total: number): string {
  return `${total === 0 ? 0 : (value / total) * 100}%`
}

export default function EditorCanvas({
  canvasRef,
  imageWidth,
  imageHeight,
  regions,
  selectedId,
  settings,
  onSelect,
  onCreate,
  onUpdate,
  onInteractionStart,
}: EditorCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  // The draft is mirrored into a ref so pointerup can read the final rect
  // without reaching for it inside a state updater — React runs those during
  // render, and notifying the parent from there is a setState-in-render bug.
  const draftRef = useRef<Rect | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [draft, setDraft] = useState<Rect | null>(null)

  // Track the space the stage has to work with, so the image can fit into it.
  useLayoutEffect(() => {
    const node = stageRef.current
    if (!node) return undefined
    const measure = () => {
      setBox({ width: node.clientWidth, height: node.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const fit = fitToBox(
    imageWidth,
    imageHeight,
    box.width || imageWidth,
    box.height || imageHeight,
  )

  /** Client coordinates -> image-pixel coordinates. */
  const toImagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return { x: 0, y: 0 }
      return {
        x: ((clientX - rect.left) / rect.width) * imageWidth,
        y: ((clientY - rect.top) / rect.height) * imageHeight,
      }
    },
    [imageWidth, imageHeight],
  )

  const startDrag = (event: ReactPointerEvent, drag: Drag) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = drag
    onInteractionStart()
    try {
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    } catch {
      // Capture is a nicety — the window-level listeners below do the real work.
    }
  }

  const beginCreate = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const point = toImagePoint(event.clientX, event.clientY)
    onSelect(null)
    draftRef.current = { x: point.x, y: point.y, width: 0, height: 0 }
    setDraft(draftRef.current)
    startDrag(event, { mode: 'create', startX: point.x, startY: point.y })
  }

  const beginMove = (event: ReactPointerEvent<HTMLDivElement>, region: Region) => {
    if (event.button !== 0) return
    const point = toImagePoint(event.clientX, event.clientY)
    onSelect(region.id)
    startDrag(event, {
      mode: 'move',
      id: region.id,
      origin: { ...region },
      startX: point.x,
      startY: point.y,
    })
  }

  const beginResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    region: Region,
    handle: Handle,
  ) => {
    if (event.button !== 0) return
    const point = toImagePoint(event.clientX, event.clientY)
    onSelect(region.id)
    startDrag(event, {
      mode: 'resize',
      id: region.id,
      origin: { ...region },
      handle,
      startX: point.x,
      startY: point.y,
    })
  }

  // Pointer move/up live on the window so a drag survives leaving the stage.
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const point = toImagePoint(event.clientX, event.clientY)
      const dx = point.x - drag.startX
      const dy = point.y - drag.startY

      if (drag.mode === 'create') {
        draftRef.current = fitRegionToImage(
          rectFromPoints(drag.startX, drag.startY, point.x, point.y),
          imageWidth,
          imageHeight,
        )
        setDraft(draftRef.current)
        return
      }
      if (drag.mode === 'move') {
        onUpdate(
          drag.id,
          moveRectWithin(drag.origin, dx, dy, imageWidth, imageHeight),
        )
        return
      }
      onUpdate(
        drag.id,
        fitRegionToImage(
          resizeRect(drag.origin, drag.handle, dx, dy),
          imageWidth,
          imageHeight,
        ),
      )
    }

    const handleUp = () => {
      const drag = dragRef.current
      const rect = draftRef.current
      dragRef.current = null
      draftRef.current = null
      if (drag?.mode !== 'create') return
      setDraft(null)
      if (rect && isRegionUsable(rect)) onCreate(rect)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [imageWidth, imageHeight, onCreate, onUpdate, toImagePoint])

  const nudge = (region: Region, dx: number, dy: number) => {
    onInteractionStart()
    onUpdate(region.id, moveRectWithin(region, dx, dy, imageWidth, imageHeight))
  }

  return (
    <div className="stage" ref={stageRef}>
      <div
        className="stage__surface"
        ref={surfaceRef}
        data-testid="editor-surface"
        style={{
          width: fit.width || undefined,
          height: fit.height || undefined,
          aspectRatio: `${imageWidth} / ${imageHeight}`,
        }}
        onPointerDown={beginCreate}
      >
        <canvas ref={canvasRef} className="stage__canvas" aria-label="Image preview" />

        {regions.map((region) => {
          const visible = clampRectToBounds(region, imageWidth, imageHeight)
          if (!visible) return null
          const isSelected = region.id === selectedId
          return (
            <div
              key={region.id}
              role="button"
              tabIndex={0}
              aria-label={`${region.effect} region`}
              aria-pressed={isSelected}
              data-testid={`region-${region.id}`}
              data-selected={isSelected || undefined}
              className={`region region--${region.shape}${
                isSelected ? ' region--selected' : ''
              }`}
              style={{
                left: percent(region.x, imageWidth),
                top: percent(region.y, imageHeight),
                width: percent(region.width, imageWidth),
                height: percent(region.height, imageHeight),
              }}
              onPointerDown={(event) => beginMove(event, region)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 10 : 1
                if (event.key === 'ArrowLeft') nudge(region, -step, 0)
                else if (event.key === 'ArrowRight') nudge(region, step, 0)
                else if (event.key === 'ArrowUp') nudge(region, 0, -step)
                else if (event.key === 'ArrowDown') nudge(region, 0, step)
                else if (event.key === 'Enter' || event.key === ' ') {
                  onSelect(region.id)
                } else return
                event.preventDefault()
              }}
            >
              {isSelected &&
                HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Resize ${handle}`}
                    className={`handle handle--${handle}`}
                    style={{ cursor: HANDLE_CURSOR[handle] }}
                    onPointerDown={(event) => beginResize(event, region, handle)}
                  />
                ))}
            </div>
          )
        })}

        {draft && (
          <div
            className={`region region--draft region--${settings.shape}`}
            data-testid="draft-region"
            style={{
              left: percent(draft.x, imageWidth),
              top: percent(draft.y, imageHeight),
              width: percent(draft.width, imageWidth),
              height: percent(draft.height, imageHeight),
            }}
          />
        )}
      </div>
    </div>
  )
}
