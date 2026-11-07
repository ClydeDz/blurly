# 🫧 Blurly

Blur or pixelate any part of an image, then download it at full size or scaled
down. Everything runs in the browser — no server, no upload, no network calls.

## Getting started

```bash
yarn install
yarn dev
```

Then open the URL Vite prints (default http://localhost:5173).

| Command           | What it does                   |
| ----------------- | ------------------------------ |
| `yarn dev`        | Dev server with hot reload     |
| `yarn build`      | Production bundle into `dist/` |
| `yarn preview`    | Serve the built bundle         |
| `yarn test`       | Run the test suite once        |
| `yarn test:watch` | Run tests in watch mode        |
| `yarn typecheck`  | Type-check without emitting    |

## Using it

1. **Add an image** — drag and drop, click _Choose an image_, or paste from the
   clipboard.
2. **Drag a box** over whatever you want hidden. Add as many areas as you like.
3. **Tune it** with the controls:
   - **Style** — blur or pixelate
   - **Shape** — box or oval (handy for faces)
   - **Blur radius / Pixel size** — how strong the effect is
   - **Edge softness** — how far the effect fades at the boundary
4. **Download** at one of three sizes, as PNG, JPEG or WebP.

Selecting an existing area loads its settings back into the sliders, so you can
change your mind about any area at any time.

### Download sizes

| Preset   | Scale | Example (1920 × 1080) |
| -------- | ----- | --------------------- |
| Original | 100%  | 1920 × 1080           |
| Medium   | 65%   | 1248 × 702            |
| Small    | 40%   | 768 × 432             |

Effects are always baked in at **full resolution first**, then the result is
downscaled. A 40% download is the same redacted picture, just smaller.

### Keyboard

| Key                                      | Action                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| Arrow keys                               | Nudge the focused area by 1px (hold <kbd>Shift</kbd> for 10px) |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selected area                                       |
| <kbd>Esc</kbd>                           | Deselect                                                       |
| <kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd>        | Undo                                                           |
| <kbd>⇧⌘Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> | Redo                                                           |

## Design

The interface is deliberately near-neutral. This is an image editor: a saturated
UI sits directly beside the user's photo and skews how they read its colours,
which is why Figma, Lightroom and Photoshop all settle on grey. Blurly follows
the same reasoning.

- **One accent.** A single blue carries every interactive affordance — buttons,
  the selection marquee, the active segment, slider fills. Nothing else competes
  with the image.
- **True-neutral greys.** The ramp has no blue or warm cast, so it never tints
  the perception of what is on the canvas. Light and dark are written out
  separately rather than inverted, because perceived lightness is not symmetric.
- **Elevation from borders, not glow.** Depth comes from 1px lines and layered
  low-opacity neutral shadows.
- **Contrast.** Every text/background pairing in both themes meets WCAG AA
  (4.5:1); most clear AAA. The selection marquee is drawn as a coloured line
  over a white halo so it stays visible on any photo, dark or light.

Themes follow the operating system on first load and can be toggled from the top
bar; the choice is stored in `localStorage` and applied before first paint so
dark-mode users never see a white flash.

## How it works

```
File ─▶ decode ─▶ full-res RGBA buffer ──────────────▶ export pipeline
                        │                                    │
                        └─▶ ≤1600px preview buffer            ├─ apply regions at 100%
                                    │                         ├─ downscale in halving steps
                                    └─▶ live canvas           └─ encode to PNG/JPEG/WebP
```

- **Two buffers.** A full-resolution buffer is kept for exporting, plus a
  preview buffer capped at 1600px on its longest side. Dragging a region only
  reprocesses the preview, so editing stays responsive on large photos.
- **Blur** is a three-pass box blur sized to approximate a Gaussian
  ([Kutskir's derivation](https://blog.ivank.net/fastest-gaussian-blur.html)).
  Alpha is premultiplied first so transparent pixels don't bleed colour.
- **Pixelate** replaces each block with its average colour.
- **Masking** builds a per-pixel coverage map for the shape, which is how ovals
  and soft edges work; the effect is composited back through that mask.
- **Downscaling** halves repeatedly rather than doing one large jump, which
  keeps big reductions crisp.

Everything that touches pixels lives in `src/lib/` and works on plain RGBA
arrays, independent of the DOM — which is why it can be tested directly.

```
src/
  lib/
    effects.ts     blur, pixelate, masking, compositing
    geometry.ts    rect maths, clamping, resize handles
    regions.ts     region creation and list operations
    export.ts      size presets, file naming, formatting
    render.ts      the canvas bridge: decode, rasterise, encode
    theme.ts       light/dark resolution and persistence
    types.ts
  components/      Dropzone, EditorCanvas, ControlPanel, DownloadPanel, Icon
  test/            jsdom canvas mock + setup
```

## Deployment

`.github/workflows/cicd.yml` typechecks, tests and builds on every branch push
and pull request, then publishes to GitHub Pages from the default branch.

To turn it on for a fresh repository:

1. Push the project to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to the default branch. The workflow URL for the live site appears on the
   `deploy` job.

The build sets `base: './'`, so the same output works at a project-site subpath
(`user.github.io/repo/`), at a domain root, and from the local filesystem — no
repo name is baked in.

## Tests

```bash
yarn test
```

191 tests across seven files. The pixel-level code is tested directly on RGBA
arrays; `src/test/canvasMock.ts` implements enough of the 2D canvas API
(`drawImage` with source-over compositing, `get`/`put`/`createImageData`,
`fillRect`, `toBlob`) that the real render and export pipeline runs unchanged
under jsdom. The integration tests in `src/__tests__/App.test.tsx` drive the
whole app: uploading, drawing, dragging, resizing, undo, and downloading each
size preset.

## A note on redaction

Blur and pixelate remove information, but neither is a cryptographic guarantee —
a weak blur over a small, predictable alphabet (a PIN, a licence plate) can
sometimes be attacked. For anything genuinely sensitive, use a large blur radius
or a big pixel size, and prefer the smaller download sizes, which discard more
information again.

## Browser support

Any modern browser with `<canvas>` and `createImageBitmap` (Chrome, Edge,
Firefox, Safari 15+). Browsers without `createImageBitmap` fall back to
decoding through an `<img>` element.

# Credits

- Developed by [Clyde D'Souza](https://clydedsouza.net/)
