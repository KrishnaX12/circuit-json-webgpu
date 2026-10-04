import { checkCopperPourOpacity } from "./check-copper-pour-opacity"
import { xRayFixtures } from "./x-ray-fixture"
import { checkXRay } from "./check-x-ray"
import {
  CircuitToWebGpuDrawer,
  type CircuitJson,
  type RenderOptions,
} from "../lib"
import { fixtures } from "./fixtures"
const canvas = document.querySelector("canvas")!,
  status = document.querySelector("#status")!
const drawer = await CircuitToWebGpuDrawer.create(canvas, {
  onDeviceLost: (message) => {
    status.textContent = message
    throw new Error(message)
  },
})
const defaultOptions: RenderOptions = {
  transform: { a: 14, b: 0, c: 0, d: -14, e: 400, f: 300 },
  selectedLayer: "top",
  hiddenLayerOpacity: 0.4,
  showCopperPours: true,
  showSolderMask: false,
  showBoardMaterial: false,
  showSilkscreen: true,
  showFabricationNotes: false,
  showPcbNotes: true,
  showCourtyards: false,
  highlightedElementIds: [],
  xRayElementIds: [],
  background: [0, 0, 0, 1],
}
async function renderFixture(name: string) {
  const fixture = fixtures[name] ?? xRayFixtures[name]
  if (!fixture) throw new Error(`Unknown fixture ${name}`)
  drawer.drawElements(fixture.elements, {
    ...defaultOptions,
    ...fixture.options,
  })
  await drawer.flush()
  status.textContent = JSON.stringify(
    { ...drawer.stats, diagnostics: drawer.diagnostics },
    null,
    2,
  )
  return { ...drawer.stats, diagnostics: drawer.diagnostics }
}
async function renderLarge() {
  const elements = (await (
    await fetch(
      new URL(
        "../tests/fixtures/am3352-dev-board.circuit.json",
        import.meta.url,
      ),
    )
  ).json()) as CircuitJson
  drawer.drawElements(elements, {
    ...defaultOptions,
    transform: { a: 9, b: 0, c: 0, d: -9, e: 400, f: 300 },
  })
  await drawer.flush()
  return { ...drawer.stats, diagnostics: drawer.diagnostics }
}
const select = document.querySelector("select")!
for (const name of [...Object.keys(fixtures), ...Object.keys(xRayFixtures)])
  select.add(new Option(name, name))
select.onchange = () => {
  void renderFixture(select.value)
}
Object.assign(window, {
  gpuTest: {
    renderFixture,
    checkBoardVisibility,
    checkXRay,
    checkCopperPourOpacity,
    renderLarge,
    drawer,
    names: Object.keys(fixtures),
    adapterInfo: drawer.adapterInfo,
  },
})
const initialFixture = new URLSearchParams(location.search).get("fixture")
select.value =
  initialFixture && (fixtures[initialFixture] || xRayFixtures[initialFixture])
    ? initialFixture
    : Object.keys(fixtures)[0]
await renderFixture(select.value)

declare global {
  interface Window {
    gpuTest: {
      checkBoardVisibility: typeof checkBoardVisibility
      checkXRay: typeof checkXRay
      checkCopperPourOpacity: typeof checkCopperPourOpacity
      renderFixture: typeof renderFixture
      renderLarge: typeof renderLarge
      drawer: CircuitToWebGpuDrawer
      names: string[]
      adapterInfo: GPUAdapterInfo | undefined
    }
  }
}

async function checkBoardVisibility() {
  const target = document.createElement("canvas")
  target.width = target.height = 200
  const renderer = await CircuitToWebGpuDrawer.create(target)
  const elements = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 12,
      height: 12,
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad",
      shape: "rect",
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      layer: "top",
    },
  ] as CircuitJson
  const camera = { transform: { a: 10, b: 0, c: 0, d: -10, e: 100, f: 100 } }
  const capture = () => target.toDataURL("image/png").split(",")[1]
  try {
    renderer.drawElements(elements, camera)
    const transparent = capture()
    renderer.render({ background: [0, 0, 0, 1] })
    const black = capture()
    renderer.render({ showSolderMask: true })
    const maskOn = capture()
    renderer.render({ transform: camera.transform })
    const retainedMask = capture()
    renderer.render({ showSolderMask: false })
    const maskOff = capture()
    renderer.render({ showBoardMaterial: true })
    const substrate = capture()
    renderer.render({ showSolderMask: true })
    renderer.drawElements(elements, { ...camera, background: [0, 0, 0, 1] })
    const independentDraw = capture()
    return {
      transparent,
      black,
      maskOn,
      retainedMask,
      maskOff,
      substrate,
      independentDraw,
      geometryUploads: renderer.stats.geometryUploads,
    }
  } finally {
    renderer.dispose()
  }
}
