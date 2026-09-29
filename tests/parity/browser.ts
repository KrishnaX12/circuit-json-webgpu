import type { prepareComparison } from "./prepare"
type Scene = NonNullable<ReturnType<typeof prepareComparison>["scene"]>
import { CircuitToWebGpuDrawer } from "../../lib"
import { parseColor } from "../../lib/colors"
import { comparisonSilkscreenColors } from "./palette"
let canvas: HTMLCanvasElement
let drawer: CircuitToWebGpuDrawer
async function render(scene: Scene) {
  if (!drawer) {
    canvas = document.createElement("canvas")
    document.body.append(canvas)
    drawer = await CircuitToWebGpuDrawer.create(canvas, {
      layerColors: {
        top_silkscreen: parseColor(comparisonSilkscreenColors.top),
        bottom_silkscreen: parseColor(comparisonSilkscreenColors.bottom),
      },
    })
  }
  canvas.width = scene.width
  canvas.height = scene.height
  drawer.setCircuitJson(
    scene.elements as unknown as Parameters<typeof drawer.setCircuitJson>[0],
  )
  drawer.render({
    transform: scene.transform,
    layers: scene.layers,
    hiddenLayerOpacity: 1,
    selectedLayer: scene.layer ?? "top",
    showCopperPours: true,
    showSilkscreen: true,
    showCourtyards: true,
    showFabricationNotes: true,
    showPcbNotes: scene.showPcbNotes,
    showSolderMask: scene.showSolderMask,
    background: [0, 0, 0, 1],
  })
  // Read this frame before presentation clears the WebGPU drawing buffer.
  const png = canvas.toDataURL("image/png").split(",")[1]
  return { png, diagnostics: drawer.diagnostics }
}
Object.assign(window, {
  parity: {
    render,
    dispose() {
      drawer?.dispose()
    },
  },
})

declare global {
  interface Window {
    parity: { render: typeof render; dispose(): void }
  }
}
