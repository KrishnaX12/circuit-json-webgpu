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
    // Exercise shutdown with queued geometry uploads, independently of diagnostics.
    report(`Compiled board: ${JSON.stringify(drawer.stats)}`)
    drawer.dispose()
    report("Worker drawer disposed", true)
  } catch (error) {
    report(String(error), true)
  }
}
