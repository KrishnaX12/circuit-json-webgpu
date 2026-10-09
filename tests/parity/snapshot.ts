import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { PNG } from "pngjs"
import { Resvg } from "@resvg/resvg-js"
import { compare } from "./compare"

/** PNG baseline contains labeled, equally sized SVG-left / rendered-GPU-right panels. */
export async function featureSnapshot(
  id: string,
  svg: PNG,
  gpu: PNG,
  key: string,
) {
  const headerHeight = 32
  const pair = new PNG({
    width: svg.width * 2,
    height: svg.height + headerHeight,
  })
  const header = PNG.sync.read(
    new Resvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pair.width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#222"/><g fill="white" font-family="sans-serif" font-size="14"><text x="8" y="22">circuit-to-svg</text><text x="${svg.width + 8}" y="22">circuit-json-webgpu</text></g></svg>`,
    )
      .render()
      .asPng(),
  )
  PNG.bitblt(header, pair, 0, 0, pair.width, headerHeight, 0, 0)
  PNG.bitblt(svg, pair, 0, 0, svg.width, svg.height, 0, headerHeight)
  PNG.bitblt(gpu, pair, 0, 0, gpu.width, gpu.height, svg.width, headerHeight)
  const buffer = PNG.sync.write(pair)
  const baselineDir = new URL("../snapshots/features/", import.meta.url)
  await mkdir(baselineDir, { recursive: true })
  await writeFile(
    new URL(`../actual/parity/${id}.pair.png`, import.meta.url),
    buffer,
  )
  let baseline = new URL(`${key}.png`, baselineDir)
  if (process.platform === "linux") {
    const linux = new URL(`linux/${key}.png`, baselineDir)
    if (
      await access(linux).then(
        () => true,
        () => false,
      )
    )
      baseline = linux
  }
  if (process.env.UPDATE_SNAPSHOTS) {
    await writeFile(baseline, buffer)
    return { pass: true, updated: true }
  }
  try {
    const expected = PNG.sync.read(await readFile(baseline))
    if (expected.width !== pair.width || expected.height !== pair.height)
      return { pass: false, error: "Snapshot dimensions changed" }
    // Labels are fixed; only compare rendered panels to avoid OS font differences.
    const crop = (p: PNG) => {
      const out = new PNG({ width: p.width, height: p.height - headerHeight })
      PNG.bitblt(p, out, 0, headerHeight, out.width, out.height, 0, 0)
      return out
    }
    const a = crop(expected),
      b = crop(pair)
    const diff = new PNG({ width: a.width, height: a.height })
    const { changed } = compare(a, b, diff)
    const pass = changed <= Math.ceil(a.width * a.height * 0.002)
    if (!pass)
      await writeFile(
        new URL(`../actual/parity/${id}.snapshot-diff.png`, import.meta.url),
        PNG.sync.write(diff),
      )
    return { pass, changedPixels: changed }
  } catch (error) {
    return { pass: false, error: String(error) }
  }
}
