# circuit-json-webgpu

A retained WebGPU PCB renderer for Circuit JSON. Geometry is triangulated and
uploaded once per circuit revision. Pan, zoom, layer visibility, and net highlights
update small GPU buffers; they do not regenerate Canvas 2D images or re-upload the
board. Canvas rendering is not used by the runtime; text layout helpers are bundled from the development dependency.

```ts
import { CircuitToWebGpuDrawer } from "@tscircuit/circuit-json-webgpu"

const drawer = await CircuitToWebGpuDrawer.create(canvas, {
  onDeviceLost: (message) => console.error(message),
})
drawer.setCircuitJson(circuitJson)
drawer.render({
  transform: { a: 10, b: 0, c: 0, d: -10, e: 400, f: 300 },
  selectedLayer: "top",
  hiddenLayerOpacity: 0.4,
  highlightedElementIds: ["pcb_trace_1"],
})
await drawer.flush() // optional; useful before snapshots
drawer.dispose()
```

`create` accepts either an HTMLCanvasElement or an OffscreenCanvas. For responsive
applications, transfer the canvas to a Worker and run this class there: compilation,
GPU uploads, and frame submission then stay off the UI thread. Camera coordinates
are physical canvas pixels; multiply the transform and canvas size by device pixel
ratio for HiDPI rendering. `drawElements(elements, options)` and
`realToCanvasMat` provide a circuit-to-canvas-style convenience API. Reuse the same
immutable elements array to retain buffers; provide a new array after an edit.

## Rendering

- Copper traces, circle/rectangle/rounded/pill/polygon pads and rotations.
- Plated holes, offset drills, slots, through and blind/buried vias.
- BRep copper pours with polygon holes and signed bulge arcs.
- Board/panel polygons, cutouts, soldermask openings.
- Vector silkscreen/copper text (including knockout), multiline alignment/mirroring, paths, circles,
  rectangles, BRep silkscreen graphics (including holes and bulge arcs),
  fabrication notes, courtyards, and translucent, diagonally hatched keepouts.
- Per-layer textures preserve layer opacity without darkening overlapping traces;
  erase passes preserve drill/cutout transparency. Four-sample MSAA is the default.

`compileCircuitJson` is a pure, DOM-free function that returns typed meshes and
unsupported-geometry diagnostics. `drawer.diagnostics` exposes the same results.
Consumers should use these diagnostics to fall back rather than silently omit
unsupported shapes. The pcb-viewer integration does this automatically.

This is an initial renderer, not full circuit-to-canvas feature parity. Curves are
camera-independent tessellations; extreme zoom can reveal facets. Interpolated/through-pad trace routes, and additional future PCB element variants
require further fixtures and implementations. Non-rendered metadata, solder paste,
and debug objects are intentionally ignored. Keepouts render a translucent fill and clipped diagonal hatching.
Device loss requires disposing/recreating the drawer or using a fallback. The
renderer never silently switches to Canvas 2D.

## Installation

```sh
bun add -D https://jscdn.tscircuit.com/@tscircuit/circuit-json-webgpu/0.0.2.tgz
```

The `.tgz` suffix selects the installable tarball; the URL without it serves JavaScript.

## Development and visual snapshots

```sh
bun install
bun run typecheck
bun run test
bun run build
bunx playwright install chromium
bun run test:visual
bun run snapshots:update # inspect changes before committing new baselines
bun run dev              # fixture gallery
```

The browser suite executes real WebGPU shaders, compares 13 visual snapshot cases, checks cutout/pour-hole pixels independently, verifies that camera
changes do not upload geometry, and exercises resize/empty-scene/disposal. It
writes actual images, diffs, and a device/performance report to `tests/actual/`.
Use `xvfb-run -a env WEBGPU_SOFTWARE=1 bun run test:visual` on Linux to
request SwiftShader; performance measurements from
software adapters should not be compared with hardware results.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an already-installed Chromium.

The AM3352 PCB fixture is derived from
[pcb-viewer at 2663068](https://github.com/tscircuit/pcb-viewer/blob/2663068/src/examples/2026/repros/am3352-dev-board/circuit.json),
retaining its PCB elements. New shape support should include geometry tests and a
small, inspectable fixture in `site/fixtures.ts` before updating snapshots.

Until the first registry release, the viewer pins a Git commit.

The package is published as `@tscircuit/circuit-json-webgpu` to GitHub Packages and served by jscdn, following the [handbook bootstrapping guide](https://github.com/tscircuit/handbook/blob/main/guides/bootstrapping-repos.md). The release workflow builds and tests the selected revision, publishes with `pver`, and records the versioned jscdn install URL. Only `dist/`, package metadata, README, and LICENSE are packaged. The upstream Canvas package is a development dependency; its used layout helpers are bundled.

This is an experimental renderer: the SVG parity audit still reports differences. Snapshot regression success does not imply full SVG parity.


## SVG / WebGPU comparison report

`circuit-to-canvas` is installed as a Git dependency pinned to
`fa8405c67634e287b79a1506eedde077ef6accb0`. The harness prepares its complete
original test suite in ignored `tests/upstream/circuit-to-canvas` from the
installed package. The manifest verifies every file; no upstream source or
snapshots are vendored in this repository.
Its original assertions run separately from the visual comparison.

```sh
bun run test:reference # 164 original tests in 116 files
bun run test:parity    # capture inputs, then render SVG and WebGPU independently
```

Each comparable case shows **circuit-to-svg on the left** and
**circuit-json-webgpu on the right**, in two fixed columns. Both use the same
Circuit JSON subset, explicit viewport, image dimensions, canonical PCB y-up
camera, layer selection, and black background. The left image is rasterized
from freshly generated SVG (linked from the image). The right is a fresh GPU
render. Neither side uses Canvas pixels, original snapshots, stacked comparison
PNGs, or prior rendering passes. Diffs are behind a separate disclosure.

Canvas-only primitive helpers, isolated soldermask/trace passes, separate clip
contexts, and mixed-side selections unsupported by the SVG API are explicitly
listed as **not comparable**, rather than assigned misleading images or counted
as passes. All original tests remain present and execute.

Open `tests/actual/parity/index.html` for the report, or inspect
[`latest-report.json`](tests/parity/latest-report.json). The old Canvas-reference
statistics do not describe this SVG comparison and have been superseded.
Full renderer parity is still incomplete; CI fails on comparison errors and
mismatches and uploads all artifacts. Native Canvas assertion failures are
reported separately.

Raw pixel differences are retained alongside an antialiasing-aware metric
(Gaussian sigma 1, radius 2; pixelmatch threshold 0.1). The allowance is the
ceiling of the smaller of 0.2% of image pixels and 2% of ink pixels, with a
four-pixel floor. Regression tests reject missing punctuation, shifted/compressed
text, and incorrect colors. No original snapshots are updated by the audit.

Text layout follows upstream glyph advances, kerning, actual ink bounds,
nine-point anchors, multiline alignment, mirroring, and knockout padding.
Disconnected glyph contours and counters are preserved; translucent glyphs are
filled without accumulating opacity at stroke joins. `DrawerOptions.textYAxis`
accepts `"down"` for Canvas coordinates (default `"up"` for PCB coordinates),
and `layerColors` accepts per-layer RGBA overrides.


## Render a Circuit JSON file locally

```sh
bun install
bunx playwright install chromium
bun run render tests/fixtures/am3352-dev-board.circuit.json --output tests/actual/am3352
```

Open `tests/actual/am3352/index.html`: SVG is on the left and the PNG rendered
by Chromium WebGPU is on the right. The command writes the original SVG, GPU
PNG, diagnostics, and viewport. Options include `--layer bottom`, `--width 1200`,
`--height 900`, and `--viewport minX,minY,maxX,maxY`. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a specific Chrome installation. For
machines without a hardware GPU, use `WEBGPU_SOFTWARE=1` (SwiftShader), with
`xvfb-run -a` on Linux. This still executes WebGPU shaders, not Canvas drawing.
Use `bun run start` for the interactive live WebGPU fixture gallery.

## Complete feature snapshot suite

```sh
bun run test:snapshots           # run upstream fixtures, render both sides, check committed PNGs
bun run snapshots:features:update # explicitly regenerate paired baselines
bun run test:parity              # additionally require SVG/WebGPU equality
bun run test:parity-layout       # verify left/right ordering at desktop and narrow widths
```

The committed `tests/snapshots/features/*.png` baselines show labeled SVG-left /
rendered-WebGPU-right panels. All 116 upstream test files execute; their 616
draw calls yield 597 comparable Circuit JSON snapshots. Nineteen Canvas-only
operations have no faithful SVG equivalent and are explicitly listed with
reasons in the coverage manifest/report. The two tests without draw calls also
remain in the upstream execution. Board outlines, cutouts, pads, holes, vias,
traces, pours, masks, text, notes, dimensions, courtyards, and keepouts are
represented, including rotation, layer, mirroring, and anchoring variants.

Snapshot tests guard against changes to the current output. The stricter
parity audit separately reports SVG/GPU differences and original upstream
assertion failures; these are never converted into parity passes by updating
baselines. Generated pairs, differences, and the HTML report are written to
`tests/actual/parity/`. CI renders through Chromium/SwiftShader and uploads
artifacts even when a check fails. Thirteen SVG references use separate Linux
font baselines because Arial/sans-serif fallback differs from macOS. Their GPU
halves matched the shared baselines; the pixel tolerance is unchanged.


### Board background and retained render options

Boards and panels draw their outlines without filling the interior by default,
so empty board areas show the configured background (or remain transparent).
Set `showBoardMaterial: true` to explicitly draw substrate. Soldermask is also
opt-in via `showSolderMask: true`, independent of substrate visibility.

`drawElements(circuit, options)` starts an independent draw with default display
options. A previous draw's enabled soldermask/material does not leak into the
next draw when those options are omitted. `render(partialOptions)` intentionally
retains display options so camera-only updates preserve visibility settings.

### X-Ray a net

Resolve the net to PCB element IDs in your connectivity map and pass them as
`xRayElementIds` to `render()` (or `drawElements()`). Traces, pads, vias, and other
selected copper render at full opacity on every layer; other copper uses
`hiddenLayerOpacity`, including copper on `selectedLayer`. Selected copper is
composited back to front with the selected layer foremost. Explicit `layers`
filters and visibility toggles still apply. Hover highlighting is suppressed during X-Ray and resumes on exit.

```ts
drawer.render({
  xRayElementIds: ["pcb_trace_1", "pcb_smtpad_1", "pcb_via_1"],
  selectedLayer: "top",
  hiddenLayerOpacity: 0.2,
})
drawer.render({ xRayElementIds: [] }) // Restore normal layer visibility.
```

Like camera changes, changing or clearing the selection updates a small mask and
uniforms without recompiling or uploading the retained geometry.
