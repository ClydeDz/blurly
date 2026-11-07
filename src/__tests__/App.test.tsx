import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { fakeImage } from '../test/canvasMock'
import { resetRegionIds } from '../lib/regions'

const IMAGE_WIDTH = 200
const IMAGE_HEIGHT = 120

/** Records every download the app triggers. */
let downloads: { name: string; href: string }[] = []

function stubEnvironment() {
  downloads = []
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () =>
      Object.assign(
        fakeImage(IMAGE_WIDTH, IMAGE_HEIGHT, (x, y) =>
          (x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
        ),
        { close: vi.fn() },
      ),
    ),
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ name: this.download, href: this.href })
  })
}

function imageFile(name = 'holiday.png') {
  return new File(['fake-bytes'], name, { type: 'image/png' })
}

async function uploadImage(name?: string) {
  const input = screen.getByLabelText('Choose an image')
  fireEvent.change(input, { target: { files: [imageFile(name)] } })
  return screen.findByTestId('editor-surface')
}

/** The surface has no layout in jsdom, so give it one to map pointers onto. */
function anchorSurface(surface: HTMLElement) {
  surface.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: IMAGE_WIDTH,
      bottom: IMAGE_HEIGHT,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      toJSON: () => ({}),
    }) as DOMRect
}

/** Drag a selection box across the image, in image-pixel coordinates. */
function drawRegion(
  surface: HTMLElement,
  from: [number, number],
  to: [number, number],
) {
  fireEvent.pointerDown(surface, {
    clientX: from[0],
    clientY: from[1],
    button: 0,
    pointerId: 1,
  })
  fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1], pointerId: 1 })
}

async function setUpEditor() {
  render(<App />)
  const surface = await uploadImage()
  anchorSurface(surface)
  return surface
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetRegionIds()
  stubEnvironment()
})

describe('landing state', () => {
  it('invites the user to add an image', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /blur or pixelate/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })

  it('promises the image never leaves the device', () => {
    render(<App />)
    expect(screen.getByText(/nothing is uploaded anywhere/i)).toBeInTheDocument()
  })

  it('shows no editor until an image is chosen', () => {
    render(<App />)
    expect(screen.queryByTestId('editor-surface')).not.toBeInTheDocument()
  })
})

describe('opening an image', () => {
  it('swaps the landing page for the editor', async () => {
    await setUpEditor()
    expect(screen.queryByTestId('dropzone')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /effect/i })).toBeInTheDocument()
  })

  it('reports the file name and dimensions', async () => {
    render(<App />)
    await uploadImage('beach-day.png')
    const meta = screen.getByTestId('image-meta')
    expect(within(meta).getByText('beach-day.png')).toBeInTheDocument()
    expect(
      within(meta).getByText(new RegExp(`${IMAGE_WIDTH} × ${IMAGE_HEIGHT}`)),
    ).toBeInTheDocument()
  })

  it('surfaces an error for a file that is not an image', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Choose an image'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/not an image/i)
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })

  it('lets the user dismiss the error', async () => {
    const user = userEvent.setup()
    render(<App />)
    fireEvent.change(screen.getByLabelText('Choose an image'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /dismiss error/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers a way back to an empty state', async () => {
    const user = userEvent.setup()
    await setUpEditor()
    await user.click(screen.getByRole('button', { name: /start over/i }))
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })
})

describe('drawing regions', () => {
  it('starts with no areas', async () => {
    await setUpEditor()
    expect(screen.getByText(/drag on the image to cover something up/i))
      .toBeInTheDocument()
  })

  it('creates an area from a drag', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [90, 80])

    expect(await screen.findByTestId('region-region-1')).toBeInTheDocument()
    expect(screen.getByText(/Box · Blur 18px radius/)).toBeInTheDocument()
  })

  it('positions the area where it was drawn', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [20, 24], [120, 84])

    const box = await screen.findByTestId('region-region-1')
    // 20/200 = 10% across, 24/120 = 20% down, 100px wide = 50%.
    expect(box.style.left).toBe('10%')
    expect(box.style.top).toBe('20%')
    expect(box.style.width).toBe('50%')
    expect(box.style.height).toBe('50%')
  })

  it('normalizes a drag made right-to-left', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [120, 84], [20, 24])

    const box = await screen.findByTestId('region-region-1')
    expect(box.style.left).toBe('10%')
    expect(box.style.top).toBe('20%')
  })

  it('ignores a stray click that draws nothing', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [40, 40], [42, 42])

    await waitFor(() => {
      expect(screen.getByText(/drag on the image/i)).toBeInTheDocument()
    })
  })

  it('selects the new area so the sliders act on it', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [80, 70])

    const box = await screen.findByTestId('region-region-1')
    expect(box).toHaveAttribute('data-selected', 'true')
    expect(screen.getByText(/editing area 1/i)).toBeInTheDocument()
  })

  it('stacks several areas', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [60, 50])
    drawRegion(surface, [100, 60], [180, 110])

    await screen.findByTestId('region-region-2')
    expect(screen.getByText('2', { selector: '.pill' })).toBeInTheDocument()
  })
})

describe('effect options', () => {
  it('switches the drawn area to pixelate', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    await user.click(screen.getByRole('button', { name: /pixelate/i }))
    expect(screen.getByText(/Box · Pixelate/)).toBeInTheDocument()
  })

  it('renames the strength slider to match the effect', async () => {
    const user = userEvent.setup()
    await setUpEditor()
    expect(screen.getByLabelText(/blur radius/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /pixelate/i }))
    expect(screen.getByLabelText(/pixel size/i)).toBeInTheDocument()
  })

  it('applies the strength slider to the selected area', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    fireEvent.change(screen.getByLabelText(/blur radius/i), {
      target: { value: '42' },
    })
    expect(screen.getByText(/Blur 42px radius/)).toBeInTheDocument()
  })

  it('switches the area to an oval', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    const box = await screen.findByTestId('region-region-1')

    await user.click(screen.getByRole('button', { name: /oval/i }))
    expect(box).toHaveClass('region--ellipse')
    expect(screen.getByText(/^Oval ·/)).toBeInTheDocument()
  })

  it('remembers the chosen settings for the next area drawn', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    await user.click(screen.getByRole('button', { name: /pixelate/i }))
    drawRegion(surface, [10, 10], [90, 80])

    await screen.findByTestId('region-region-1')
    expect(screen.getByText(/Box · Pixelate/)).toBeInTheDocument()
  })

  it('reloads the sliders when a different area is selected', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()

    drawRegion(surface, [10, 10], [60, 50])
    fireEvent.change(screen.getByLabelText(/blur radius/i), {
      target: { value: '50' },
    })
    drawRegion(surface, [100, 60], [180, 110])
    fireEvent.change(screen.getByLabelText(/blur radius/i), {
      target: { value: '5' },
    })

    await user.click(screen.getByRole('button', { name: /Box · Blur 50px/ }))
    expect(screen.getByLabelText(/blur radius/i)).toHaveValue('50')
  })
})

describe('managing areas', () => {
  it('deletes an area from its list row', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    await user.click(screen.getByRole('button', { name: /delete area 1/i }))
    expect(screen.queryByTestId('region-region-1')).not.toBeInTheDocument()
  })

  it('deletes the selected area with the keyboard', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    fireEvent.keyDown(window, { key: 'Backspace' })
    await waitFor(() => {
      expect(screen.queryByTestId('region-region-1')).not.toBeInTheDocument()
    })
  })

  it('clears every area at once', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [60, 50])
    drawRegion(surface, [100, 60], [180, 110])
    await screen.findByTestId('region-region-2')

    await user.click(screen.getByRole('button', { name: /clear all/i }))
    expect(screen.getByText(/drag on the image/i)).toBeInTheDocument()
  })

  it('nudges the selected area with the arrow keys', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [80, 80])
    const box = await screen.findByTestId('region-region-1')

    fireEvent.keyDown(box, { key: 'ArrowRight' })
    // One image pixel of 200 is 0.5%.
    await waitFor(() => expect(box.style.left).toBe('10.5%'))
  })

  it('undoes and redoes a deletion', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    await user.click(screen.getByRole('button', { name: /delete area 1/i }))
    expect(screen.queryByTestId('region-region-1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(await screen.findByTestId('region-region-1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^redo$/i }))
    await waitFor(() => {
      expect(screen.queryByTestId('region-region-1')).not.toBeInTheDocument()
    })
  })

  it('undoes with the keyboard shortcut', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    await waitFor(() => {
      expect(screen.queryByTestId('region-region-1')).not.toBeInTheDocument()
    })
  })

  it('disables undo before anything has happened', async () => {
    await setUpEditor()
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^redo$/i })).toBeDisabled()
  })
})

describe('downloading', () => {
  it('offers all three sizes with their pixel dimensions', async () => {
    await setUpEditor()
    const download = screen.getByRole('region', { name: /download/i })

    expect(within(download).getByText('Original')).toBeInTheDocument()
    expect(within(download).getByText(/200 × 120/)).toBeInTheDocument()
    expect(within(download).getByText(/130 × 78/)).toBeInTheDocument()
    expect(within(download).getByText(/80 × 48/)).toBeInTheDocument()
  })

  it('saves the original at full size', async () => {
    const user = userEvent.setup()
    await setUpEditor()

    await user.click(screen.getByRole('button', { name: /Original/ }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0].name).toBe('holiday-blurred.png')
    expect(screen.getByText(/saved the original version/i)).toBeInTheDocument()
  })

  it('names the medium and small exports distinctly', async () => {
    const user = userEvent.setup()
    await setUpEditor()

    await user.click(screen.getByRole('button', { name: /Medium/ }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /Small/ }))
    await waitFor(() => expect(downloads).toHaveLength(2))

    expect(downloads.map((d) => d.name)).toEqual([
      'holiday-blurred-medium.png',
      'holiday-blurred-small.png',
    ])
  })

  it('honours the chosen file format', async () => {
    const user = userEvent.setup()
    await setUpEditor()

    await user.click(screen.getByRole('button', { name: 'JPEG' }))
    await user.click(screen.getByRole('button', { name: /Original/ }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(downloads[0].name).toBe('holiday-blurred.jpg')
  })

  it('only offers a quality slider for lossy formats', async () => {
    const user = userEvent.setup()
    await setUpEditor()
    expect(screen.queryByLabelText(/quality/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'WebP' }))
    expect(screen.getByLabelText(/quality/i)).toBeInTheDocument()
  })

  it('exports the regions that were drawn', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [90, 80])
    await screen.findByTestId('region-region-1')

    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
    await user.click(screen.getByRole('button', { name: /Small/ }))
    await waitFor(() => expect(downloads).toHaveLength(1))

    // Last encode is the 40% canvas: 200x120 -> 80x48.
    const encoded = encode.mock.instances.at(-1) as HTMLCanvasElement
    expect(encoded.width).toBe(80)
    expect(encoded.height).toBe(48)
  })

  it('reports a failure to encode instead of failing silently', async () => {
    const user = userEvent.setup()
    await setUpEditor()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      callback(null)
    })

    await user.click(screen.getByRole('button', { name: /Original/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not encode/i)
    expect(downloads).toHaveLength(0)
  })
})

describe('moving and resizing areas', () => {
  it('drags an existing area to a new spot', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [80, 80])
    const box = await screen.findByTestId('region-region-1')
    expect(box.style.left).toBe('10%')

    fireEvent.pointerDown(box, { clientX: 50, clientY: 50, button: 0, pointerId: 2 })
    fireEvent.pointerMove(window, { clientX: 70, clientY: 50, pointerId: 2 })
    fireEvent.pointerUp(window, { clientX: 70, clientY: 50, pointerId: 2 })

    // Moved 20 image px right, which is 10% of a 200px-wide image.
    await waitFor(() => expect(box.style.left).toBe('20%'))
    expect(box.style.top).toBe('16.666666666666664%')
  })

  it('keeps a dragged area inside the image', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [80, 80])
    const box = await screen.findByTestId('region-region-1')

    fireEvent.pointerDown(box, { clientX: 50, clientY: 50, button: 0, pointerId: 2 })
    fireEvent.pointerMove(window, { clientX: 9999, clientY: 9999, pointerId: 2 })
    fireEvent.pointerUp(window, { clientX: 9999, clientY: 9999, pointerId: 2 })

    // 60px-wide box pinned against the right edge of a 200px image: 140/200.
    await waitFor(() => expect(box.style.left).toBe('70%'))
    expect(box.style.top).toBe('50%')
  })

  it('resizes from a corner handle', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [80, 80])
    const box = await screen.findByTestId('region-region-1')
    expect(box.style.width).toBe('30%')

    const handle = within(box).getByRole('button', { name: /resize se/i })
    fireEvent.pointerDown(handle, { clientX: 80, clientY: 80, button: 0, pointerId: 3 })
    fireEvent.pointerMove(window, { clientX: 120, clientY: 80, pointerId: 3 })
    fireEvent.pointerUp(window, { clientX: 120, clientY: 80, pointerId: 3 })

    // Grew 40 image px wider: 100/200 = 50%.
    await waitFor(() => expect(box.style.width).toBe('50%'))
    expect(box.style.height).toBe('50%')
  })

  it('only shows handles on the selected area', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [60, 50])
    drawRegion(surface, [100, 60], [180, 110])

    const first = await screen.findByTestId('region-region-1')
    const second = await screen.findByTestId('region-region-2')
    expect(within(first).queryAllByRole('button')).toHaveLength(0)
    expect(within(second).getAllByRole('button')).toHaveLength(8)
  })

  it('folds a whole drag into one undo step', async () => {
    const user = userEvent.setup()
    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [80, 80])
    const box = await screen.findByTestId('region-region-1')

    fireEvent.pointerDown(box, { clientX: 50, clientY: 50, button: 0, pointerId: 4 })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 50, pointerId: 4 })
    fireEvent.pointerMove(window, { clientX: 70, clientY: 50, pointerId: 4 })
    fireEvent.pointerUp(window, { clientX: 70, clientY: 50, pointerId: 4 })
    await waitFor(() => expect(box.style.left).toBe('20%'))

    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    await waitFor(() => expect(box.style.left).toBe('10%'))
  })

  it('deselects when clicking empty canvas', async () => {
    const surface = await setUpEditor()
    drawRegion(surface, [10, 10], [50, 50])
    const box = await screen.findByTestId('region-region-1')
    expect(box).toHaveAttribute('data-selected', 'true')

    fireEvent.pointerDown(surface, { clientX: 150, clientY: 100, button: 0, pointerId: 5 })
    fireEvent.pointerUp(window, { clientX: 150, clientY: 100, pointerId: 5 })

    await waitFor(() => expect(box).not.toHaveAttribute('data-selected'))
  })
})

describe('render hygiene', () => {
  it('completes a draw without any React warnings', async () => {
    const complaints: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      complaints.push(args)
    })

    const surface = await setUpEditor()
    drawRegion(surface, [20, 20], [90, 80])
    await screen.findByTestId('region-region-1')

    expect(complaints).toEqual([])
  })
})

describe('theme', () => {
  it('follows the system preference on first load', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<App />)
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    )
  })

  it('toggles between light and dark', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    render(<App />)
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('light'),
    )

    await user.click(screen.getByRole('button', { name: /switch to dark/i }))
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(screen.getByRole('button', { name: /switch to light/i }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('remembers the choice for next time', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    render(<App />)
    await user.click(screen.getByRole('button', { name: /switch to dark/i }))
    expect(localStorage.getItem('blurly:theme')).toBe('dark')
  })
})
