export {}
const status = document.querySelector<HTMLElement>("#status")!
const heartbeat = document.querySelector<HTMLElement>("#heartbeat")!
const button = document.querySelector<HTMLButtonElement>("#run")!
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!
const params = new URLSearchParams(location.search)
const baseline = params.has("baseline")
const probe = params.get("probe")
let ticks = 0
let previous = performance.now()
let maxDelay = 0
setInterval(() => {
  const now = performance.now()
  maxDelay = Math.max(maxDelay, now - previous - 100)
  previous = now
  heartbeat.textContent = `Heartbeat ${++ticks}; max delay ${maxDelay.toFixed(1)} ms`
}, 100)
if (probe) {
  setInterval(() => {
    void fetch(probe, {
      method: "POST",
      body: JSON.stringify({
        mode: baseline
          ? "library-shutdown-baseline"
          : "library-shutdown-patched",
        ticks,
        hash: location.hash,
        maxDelay,
      }),
    }).catch(() => {})
  }, 500)
}
status.textContent = baseline ? "Baseline renderer" : "Patched renderer"
button.onclick = async () => {
  button.disabled = true
  try {
    const response = await fetch("/.vite/f1c100s.circuit.json")
    if (!response.ok) throw new Error("Run the preparation script first")
    const elements = await response.json()
    const worker = new Worker(new URL("./f1c100s.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.onmessage = ({ data }) => {
      status.textContent += `\n${data.message}`
      // Match pcb-viewer's failure path: discard the canvas and stop the worker.
      if (data.failed) {
        canvas.remove()
        worker.terminate()
        status.textContent += "\nCanvas removed; worker terminated"
      }
    }
    worker.onerror = (event) => {
      status.textContent += `\nWorker error: ${event.message}`
    }
    const offscreen = canvas.transferControlToOffscreen()
    worker.postMessage({ canvas: offscreen, elements, baseline }, [offscreen])
  } catch (error) {
    status.textContent += `\n${error}`
  }
}
