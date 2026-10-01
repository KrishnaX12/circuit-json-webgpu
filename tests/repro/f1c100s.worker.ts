import { CircuitToWebGpuDrawer as PatchedDrawer } from "../../lib"
self.onmessage = async ({ data }) => {
  const report = (message: string, failed = false) =>
    self.postMessage({ message, failed })
  try {
    const baselineUrl = "/.vite/f1c100s-baseline.js"
    const { CircuitToWebGpuDrawer } = data.baseline
      ? await import(/* @vite-ignore */ baselineUrl)
      : { CircuitToWebGpuDrawer: PatchedDrawer }
    report("Creating worker renderer")
    const drawer = await CircuitToWebGpuDrawer.create(data.canvas)
    report("Compiling published board")
    drawer.setCircuitJson(data.elements)
    // pcb-viewer rejects any unsupported geometry diagnostics.
    if (drawer.diagnostics.length) {
      report(`Rejecting ${drawer.diagnostics.length} diagnostics; disposing`)
      drawer.dispose()
      report("Worker drawer disposed", true)
      return
    }
    drawer.render({
      transform: { a: 16, b: 0, c: 0, d: -16, e: 600, f: 450 },
    })
    await drawer.flush()
    report(`Rendered successfully: ${JSON.stringify(drawer.stats)}`)
  } catch (error) {
    report(String(error), true)
  }
}
