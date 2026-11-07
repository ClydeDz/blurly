# AGENTS.md

Context for AI agents working on **Blurly** — a browser-only tool for blurring or
pixelating parts of an image and downloading the result at three sizes.

Read this before changing anything. Most of it exists because a plausible-looking
change would quietly break a correctness or privacy property.

---

## Hard constraints

These are not preferences. Breaking one is a bug.

1. **No backend. No network.** Every pixel is processed on the client. Do not add
   `fetch`, XHR, WebSockets, analytics, error reporting, or any CDN asset beyond
   the Google Fonts stylesheet already in `index.html`. The landing page promises
   "Nothing is uploaded anywhere" and the top bar says "Stays on your device" —
   those claims must stay literally true.
2. **Yarn only.** Use `yarn add` / `yarn add -D` / `yarn <script>`. Never `npm
   install` — it produces a competing lockfile. (`npx` for a one-off binary is
   fine; it writes no lockfile.)
3. **Effects are applied at full resolution, then downscaled.** Never the other
   way round. See "Two-buffer architecture" below.
4. **Pixel code stays DOM-free.** `src/lib/effects.ts` and `src/lib/geometry.ts`
   operate on plain RGBA arrays and numbers. Canvas and DOM access belongs in
   `src/lib/render.ts` and the components. This separation is what makes the
   maths directly testable.

---

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Vite dev server (port 5173 by default) |
| `yarn build` | Production bundle into `dist/` |
| `yarn preview` | Serve the built bundle |
| `yarn test` | Run all tests once |
| `yarn test:watch` | Watch mode |
| `yarn typecheck` | `tsc --noEmit` |

**Before declaring work done, run all three:** `yarn typecheck && yarn test && yarn build`.
Vitest does **not** typecheck, so a green test run can still hide type errors.

`.claude/launch.json` defines a `blurly` preview config on port 5183 for driving
the app in a browser. Prefer that over spawning a dev server from a shell.

---

## CI and deployment

`.github/workflows/cicd.yml` runs on pushes to any branch, on every pull
request, and on manual dispatch.

- **`verify`** — install (`--frozen-lockfile`), typecheck, test, build. Runs for
  pull requests too, so a broken build is caught before merge.
- **`deploy`** — needs `verify`, and only publishes from the **default branch**
  on a push or manual dispatch. Publishes `dist/` to GitHub Pages via
  `actions/deploy-pages`, with `pages: write` and `id-token: write` permissions.

Two things not to "fix":

1. **There is no `actions/configure-pages` step and no `--base` flag.**
   `vite.config.ts` sets `base: './'`, so the bundle references assets relatively
   and works unchanged at `https://<user>.github.io/<repo>/`, at a domain root,
   and from `file://`. Hardcoding a base path would tie the build to one repo
   name and break local `yarn preview`.
2. **`typecheck` is a separate step from `test` on purpose.** Vitest does not
   typecheck, so folding them together would let type errors reach `main`.

Pages must be configured once in the repository settings under
**Settings → Pages → Build and deployment → Source: GitHub Actions**. Without
that, `deploy` fails even though `verify` passes.

---

## Stack

React 19 · TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`) · Vite ·
Vitest + jsdom + Testing Library. Runtime dependencies are **only** `react` and
`react-dom` — no UI kit, no icon package, no image library. Keep it that way
unless there is a strong reason; the whole point is a small, auditable bundle.

---

## Layout

```
src/
  App.tsx                 State owner: image, buffers, regions, history, theme, export
  main.tsx                Entry point
  styles.css              All styling; design tokens live at the top
  lib/
    types.ts              Region, Rect, PixelBuffer, EffectSettings, SizePreset…
    effects.ts            blur, pixelate, masks, compositing — pure, DOM-free
    geometry.ts           rect maths, clamping, resize handles — pure, DOM-free
    regions.ts            region creation and list operations
    export.ts             size presets, file naming, byte formatting
    render.ts             the canvas bridge: decode, rasterise, scale, encode
    theme.ts              light/dark resolution and persistence
  components/
    EditorCanvas.tsx      The interactive surface: drawing, moving, resizing
    ControlPanel.tsx      Effect, shape, strength, softness, region list
    DownloadPanel.tsx     Format, quality, the three size cards
    Dropzone.tsx          Full and compact file pickers
    Icon.tsx              Hand-rolled SVG icon set
  test/
    canvasMock.ts         Software 2D canvas for jsdom
    setup.ts              Global test setup
```

---

## Two-buffer architecture

This is the single most important thing to understand.

```
File ─▶ decode ─▶ full-res RGBA buffer ─────────────▶ export pipeline
                        │                                  │
                        └─▶ ≤1600px preview buffer          ├─ apply regions at 100%
                                    │                       ├─ downscale in halving steps
                                    └─▶ live canvas         └─ encode PNG/JPEG/WebP
```

- `buffers.source` is full resolution and is what gets exported.
- `buffers.preview` is capped at `MAX_PREVIEW_DIMENSION` (1600px on the longest
  side) so dragging a region stays responsive on large photos.
- `buffers.scratch` is a reusable destination for `applyRegionsInto`, so the live
  preview does not allocate a multi-megabyte array on every pointer move.

**Regions are always stored in full-resolution image-pixel coordinates**, origin
top-left. `regionsForPreview(regions, previewScale)` maps them onto the preview
buffer, scaling geometry *and* `strength` together — otherwise a 20px blur would
look identical on preview and export despite covering different real areas.

**Why effects come before downscaling:** a 40% export must still be redacted. If
you downscaled first and blurred after, the blur radius would be relative to the
smaller image and the redaction would differ per size. `renderExport` in
`render.ts` enforces the correct order; there is a test that a fully-pixelated
image stays uniform after a 40% export.

---

## Non-obvious invariants

**`applyRegions` must not mutate its source buffer.** `App.tsx` re-renders the
preview from `buffers.preview` on every change; a mutation would compound
effects on each frame. Tested in `effects.test.ts`.

**Blur premultiplies alpha before blurring and unpremultiplies after.** Without
this, transparent pixels drag their (arbitrary) colour into their neighbours.
Tested with a half-transparent buffer.

**Blur samples only inside the region.** `extractRegion` copies the rect out
first, so edge pixels clamp against the region boundary rather than pulling in
surrounding image content.

**Masks always fade at least one pixel**, even at `feather: 0`, so ellipse edges
are antialiased rather than stair-stepped.

**`fitRegionToImage` clips each edge independently.** Clamping only the origin
leaves the original width and lets the rect run off the far side — this was a
real bug. Tested.

**JPEG has no alpha,** so `renderExport` flattens onto white before encoding.
Skipping this renders transparency as black.

---

## React and accessibility gotchas that bit us

**Never call a parent callback inside a `setState` updater.** React runs updaters
during the render phase, so notifying the parent from there is a
setState-in-render bug. `EditorCanvas` mirrors the draft rect into `draftRef` and
calls `onCreate` from the pointerup handler instead. There is a regression test
(`render hygiene > completes a draw without any React warnings`) that fails if
you reintroduce it — it asserts `console.error` is never called.

**Do not nest labelable elements inside `<label>`.** An `<output>` inside a
`<label for="…">` becomes associated with that label, making `getByLabelText`
ambiguous and confusing screen readers. Value readouts are a sibling `<span
aria-hidden="true">`, with the live value exposed on the input via
`aria-valuetext`.

**Keep SVG icons `aria-hidden`.** Button accessible names come from their text or
`aria-label`; tests query by those names.

---

## Testing

`src/test/canvasMock.ts` implements a software 2D canvas because **jsdom ships no
canvas at all**. It backs each canvas with a real RGBA array and implements
`drawImage` (with nearest-neighbour scaling **and source-over compositing**),
`get`/`put`/`createImageData`, `fillRect`, `clearRect` and `toBlob`. This lets
the real render and export pipeline run unmodified under jsdom.

- If you call a 2D context method the mock lacks, **add it to the mock** rather
  than mocking out the module under test.
- `drawImage` composites source-over, matching the real API. A raw pixel copy
  would punch transparent holes through what is already painted — that broke the
  JPEG-flattening test.
- `toBlob` returns a few real bytes, not a genuine encode. Do not assert on exact
  file sizes; assert on canvas dimensions instead (spy on `toBlob` and read
  `this.width`/`this.height`).

**jsdom has no layout**, so `getBoundingClientRect()` returns zeros. App tests
stub it on the editor surface (`anchorSurface` in `App.test.tsx`) so pointer
coordinates map onto image pixels. `ResizeObserver`, `setPointerCapture`,
`matchMedia` and `URL.createObjectURL` are all stubbed in `setup.ts`.

**Image loading is exercised by stubbing `createImageBitmap`** to return a
`fakeImage(width, height, fill)` with known pixels. Assert on real pixel values
via `readSurface`, not on screenshots.

Current suite: **191 tests across 7 files.** Pure maths is tested directly on
RGBA arrays; `App.test.tsx` drives the whole app end to end.

---

## Design system

The palette is deliberately near-neutral, and this is a functional decision, not
a stylistic one: **a saturated UI sits beside the user's photo and skews how they
read its colours**, which is why Figma, Lightroom and Photoshop all settle on
grey. An earlier neon version was rejected for exactly this reason. Do not
reintroduce gradients, glows, or a second accent hue.

- **One accent** (`--accent`, blue) carries every interactive affordance: primary
  buttons, the selection marquee, the active segment, slider fills.
- **True-neutral greys**, no blue or warm cast.
- **Light and dark are written out separately**, not derived by inverting the
  ramp — perceived lightness is not symmetric.
- **Elevation from 1px borders and layered low-opacity neutral shadows**, never
  coloured glow.
- **The selection marquee is a coloured line over a white halo** so it stays
  visible on any photo, dark or light.

All tokens live at the top of `styles.css`. Change colours there, never inline.

**Contrast is a requirement, not an aspiration.** Every text/background pairing
in both themes must meet WCAG AA (4.5:1). If you touch the palette, measure it —
compute the ratio with translucent tokens composited over their real backdrop, or
a token like `--accent-subtle` will report a meaningless value. A grey that
passed on white failed at 4.25:1 on the inset background; that is the kind of
thing only measurement catches.

Themes follow the OS on first load, are toggleable from the top bar, persist to
`localStorage` under `blurly:theme`, and are applied by an inline script in
`index.html` **before first paint** so dark-mode users never see a white flash.
If you rename the storage key, update that script too.

---

## Verifying visually

jsdom cannot tell you whether a blur looks right or a layout holds. For anything
visual, drive the running app:

1. Start the `blurly` preview config.
2. Generate a test image in-page with a canvas and feed it to the file input via
   `DataTransfer` — `App.test.tsx` and this repo's history show the pattern.
3. Take screenshots, and check the console for errors.

Two real bugs (the setState-in-render warning and the contrast failure) were only
ever visible this way.

---

## Scope notes

- Blur and pixelate remove information but are **not** cryptographic guarantees.
  The README says so plainly. Do not add copy that overstates this.
- `dist/` is build output and is gitignored. Do not edit it or commit it.
- There is no linter or formatter configured. Match the surrounding style:
  2-space indent, no semicolons, single quotes, trailing commas.
