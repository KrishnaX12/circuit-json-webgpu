import assert from "node:assert/strict"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import { chromium } from "playwright"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"

const root = fileURLToPath(new URL("../", import.meta.url))
const server = await createServer({
  root,
  server: {
    host: "127.0.0.1",
    port: 0,
    hmr: false,
    watch: { ignored: ["**/*"] },
  },
  logLevel: "error",
})
await server.listen()
let browser
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      ...(process.env.WEBGPU_SOFTWARE
        ? [
            "--enable-gpu",
            "--use-angle=swiftshader",
            "--use-vulkan=swiftshader",
            "--enable-features=Vulkan",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ]
        : []),
    ],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  })
  const page = await browser.newPage({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: 1,
  })
  const errors: string[] = []
  page.on("pageerror", (e) => {
    errors.push(e.message)
    console.error(e.message)
  })
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text())
      console.error(m.text())
    }
  })
  await page.goto(server.resolvedUrls!.local[0])
  await page.waitForFunction(() => window.gpuTest, null, { timeout: 30000 })
  const visibility = await page.evaluate(() =>
    window.gpuTest.checkBoardVisibility(),
  )
  const pixel = (png: string, x: number, y: number) => {
    const image = PNG.sync.read(Buffer.from(png, "base64"))
    return [
      ...image.data.subarray(
        (y * image.width + x) * 4,
        (y * image.width + x) * 4 + 4,
      ),
    ]
  }
  const xray = await page.evaluate(() => window.gpuTest.checkXRay())
  const layerColors = {
    top: [200, 52, 52, 255],
    inner1: [127, 200, 127, 255],
    bottom: [77, 127, 196, 255],
  }
  for (const [layer, color] of Object.entries(layerColors)) {
    assert.deepEqual(
      pixel(xray.frames[layer], 100, 100),
      color,
      `X-Ray must keep ${layer} in front at the overlap`,
    )
    for (const x of [40, 100, 160])
      assert.equal(pixel(xray.frames[layer], x, 50)[3], 255)
    assert.equal(pixel(xray.frames[layer], 100, 150)[3], 0)
  }
  for (const x of [40, 80, 120, 160]) {
    assert(pixel(xray.frames.before, x, 20)[3] > 0)
    assert.equal(
      pixel(xray.frames.dimmed, x, 20)[3],
      0,
      "Non-copper layers must be transparent during X-Ray",
    )
    assert.equal(
      pixel(xray.frames.exit, x, 20)[3],
      pixel(xray.frames.before, x, 20)[3],
      "Non-copper layers must return after X-Ray",
    )
  }
  for (const x of [40, 160]) {
    for (const frame of ["top", "dimmed", "fivePercent"])
      assert.deepEqual(
        pixel(xray.frames[frame], x, 130),
        [255, 38, 226, 255],
        "Selected drills must stay opaque",
      )
    assert.equal(
      pixel(xray.frames.dimmed, x, 170)[3],
      0,
      "Unrelated drills stay hidden",
    )
    assert.equal(
      pixel(xray.frames.changed, x, 130)[3],
      0,
      "Changing the net hides its old drills",
    )
    assert.equal(
      pixel(xray.frames.filtered, x, 130)[3],
      0,
      "Explicit layer filters can hide drills",
    )
    assert.deepEqual(
      pixel(xray.frames.exit, x, 170),
      [255, 38, 226, 255],
      "All drills return on exit",
    )
  }
  assert.equal(pixel(xray.frames.fivePercent, 100, 150)[3], 13)
  assert.equal(pixel(xray.frames.fivePercent, 40, 50)[3], 255)
  assert.equal(pixel(xray.frames.dimmed, 100, 150)[3], 102)
  assert.equal(
    xray.frames.hover,
    xray.frames.dimmed,
    "X-Ray must ignore highlighting on both selected and unrelated copper",
  )
  assert.deepEqual(
    pixel(xray.frames.exit, 100, 150),
    [255, 78, 78, 255],
    "Highlighting resumes after exiting X-Ray",
  )
  assert.deepEqual(pixel(xray.frames.changed, 40, 50), layerColors.bottom)
  assert.equal(pixel(xray.frames.changed, 160, 50)[3], 102)
  assert.equal(pixel(xray.frames.exit, 40, 50)[3], 0)
  assert.equal(pixel(xray.frames.exit, 160, 50)[3], 255)
  assert.deepEqual(pixel(xray.frames.filtered, 100, 100), layerColors.bottom)
  assert.deepEqual(pixel(xray.frames.resized, 100, 100), layerColors.top)
  assert.equal(
    xray.geometryUploads,
    1,
    "X-Ray changes and resizing must reuse geometry",
  )
  assert.deepEqual(pixel(visibility.transparent, 70, 70), [0, 0, 0, 0])
  for (const png of [
    visibility.black,
    visibility.maskOff,
    visibility.independentDraw,
  ]) {
    assert.deepEqual(
      pixel(png, 70, 70),
      [0, 0, 0, 255],
      "Empty board area must stay black with material/mask off",
    )
    assert.deepEqual(
      pixel(png, 100, 100),
      [200, 52, 52, 255],
      "Copper must remain visible",
    )
    assert(pixel(png, 40, 70)[0] > 40, "Board outline must remain visible")
  }
  assert.deepEqual(pixel(visibility.maskOn, 70, 70), [12, 55, 33, 255])
  assert.deepEqual(pixel(visibility.retainedMask, 70, 70), [12, 55, 33, 255])
  assert.deepEqual(pixel(visibility.substrate, 70, 70), [70, 72, 72, 255])
  assert.equal(
    visibility.geometryUploads,
    1,
    "Visibility changes must not rebuild geometry",
  )
  const names = await page.evaluate(() => window.gpuTest.names)
  await mkdir(new URL("./actual/", import.meta.url), { recursive: true })
  async function snapshot(name: string) {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    const buffer = await page.locator("canvas").screenshot()
    // SwiftShader uses different MSAA sample positions on the subpixel courtyard edge.
    const baseline =
      process.env.WEBGPU_SOFTWARE && name === "annotations"
        ? `${name}.swiftshader`
        : name
    const file = new URL(`./snapshots/${baseline}.png`, import.meta.url)
    if (process.env.UPDATE_SNAPSHOTS) await writeFile(file, buffer)
    else {
      const expected = PNG.sync.read(await readFile(file)),
        actual = PNG.sync.read(buffer)
      assert.equal(actual.width, expected.width)
      assert.equal(actual.height, expected.height)
      const diff = new PNG({ width: actual.width, height: actual.height })
      const changed = pixelmatch(
        expected.data,
        actual.data,
        diff.data,
        actual.width,
        actual.height,
        { threshold: 0.1 },
      )
      if (changed > actual.width * actual.height * 0.002) {
        await writeFile(
          new URL(`./actual/${name}.png`, import.meta.url),
          buffer,
        )
        await writeFile(
          new URL(`./actual/${name}.diff.png`, import.meta.url),
          PNG.sync.write(diff),
        )
        throw new Error(
          `${name}: ${changed} pixels differ from the approved snapshot`,
        )
      }
    }
    console.log(`snapshot ${name}`)
    return PNG.sync.read(buffer)
  }
  for (const name of names) {
    const stats = await page.evaluate(
      (name) => window.gpuTest.renderFixture(name),
      name,
    )
    assert.deepEqual(stats.diagnostics, [])
    const image = await snapshot(name)
    // Independent checks: a board cutout reveals the black clear color; a pour hole
    // reveals the board/bottom copper rather than red top-layer copper.
    const at = (x: number, y: number) => [
      ...image.data.slice(
        ((y + 1) * image.width + x + 1) * 4,
        ((y + 1) * image.width + x + 1) * 4 + 3,
      ),
    ]
    if (name === "silkscreen-graphics") {
      // World coordinates use the gallery's 14 px/mm camera. Check ink and
      // clear holes independently so snapshot updates cannot fill the counters.
      assert.deepEqual(
        at(232, 230),
        [242, 237, 161],
        "Top graphic must use top silkscreen color",
      )
      assert.deepEqual(at(232, 300), [0, 0, 0], "Circular hole must stay clear")
      assert.deepEqual(
        at(568, 300),
        [93, 169, 233],
        "Bottom graphic must use bottom silkscreen color",
      )
      assert.deepEqual(
        at(540, 300),
        [0, 0, 0],
        "First bottom hole must stay clear",
      )
      assert.deepEqual(
        at(596, 300),
        [0, 0, 0],
        "Second bottom hole must stay clear",
      )
      assert.deepEqual(
        at(638, 230),
        [0, 0, 0],
        "Outside the curved boundary stays clear",
      )
    }
    if (name === "board-outline-cutout")
      assert.deepEqual(at(400, 300), [0, 0, 0])
    if (name === "pour-holes-and-arcs") {
      assert(at(200, 300)[0] > 150)
      assert(at(400, 280)[0] < 100)
    }
  }
  const large = await page.evaluate(() => window.gpuTest.renderLarge())
  assert.deepEqual(large.diagnostics, [])
  await snapshot("am3352-dev-board")
  const navigation = await page.evaluate(
    async (frameCount) => {
      const drawer = window.gpuTest.drawer,
        uploads = drawer.stats.geometryUploads,
        samples = [],
        frames = []
      let previous = performance.now()
      for (let i = 0; i < frameCount; i++) {
        await new Promise(requestAnimationFrame)
        const start = performance.now()
        frames.push(start - previous)
        previous = start
        const scale = 9 * (1 + i / 60)
        drawer.render({
          transform: { a: scale, b: 0, c: 0, d: -scale, e: 400 + i, f: 300 },
        })
        samples.push(performance.now() - start)
      }
      await drawer.flush()
      samples.sort((a, b) => a - b)
      frames.sort((a, b) => a - b)
      return {
        geometryUploadsDuringZoom: drawer.stats.geometryUploads - uploads,
        submitP95Ms: samples[Math.floor(frameCount * 0.95)],
        frameP95Ms: frames[Math.floor(frameCount * 0.95)],
        maxFrameMs: frames.at(-1),
      }
    },
    process.env.WEBGPU_SOFTWARE ? 12 : 90,
  )
  assert.equal(navigation.geometryUploadsDuringZoom, 0)
  const adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter(),
      info = adapter!.info
    return {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
      isFallbackAdapter: info.isFallbackAdapter,
    }
  })
  await page.evaluate(async () => {
    const drawer = window.gpuTest.drawer,
      canvas = document.querySelector("canvas")!
    canvas.width = 1200
    canvas.height = 900
    drawer.render()
    await drawer.flush()
    drawer.setCircuitJson([])
    drawer.render()
    await drawer.flush()
    drawer.dispose()
    drawer.dispose()
  })
  // Ignore the browser's optional favicon request.
  assert.deepEqual(
    errors.filter((e) => !e.includes("404")),
    [],
  )
  const report = { snapshots: names.length + 1, adapter, large, navigation }
  await writeFile(
    new URL("./actual/report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  await server.close()
}
