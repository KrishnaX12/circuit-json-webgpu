import { expect, test } from "bun:test"
import { compileCircuitJson } from "../lib"
import { drawKeepout } from "../lib/draw-keepout"
import {
  ellipse,
  expandBrepRing,
  MeshBuilder,
  rectangle,
} from "../lib/geometry"
import { fixtures, silkscreenGraphics } from "../site/fixtures"
import large from "./fixtures/am3352-dev-board.circuit.json"

function area(mesh: ReturnType<MeshBuilder["build"]>) {
  let area = 0
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [...mesh.indices.slice(i, i + 3)].map((j) => ({
      x: mesh.vertices[j * 8],
      y: mesh.vertices[j * 8 + 1],
    }))
    area += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
  }
  return area
}
test("triangulation preserves polygon holes", () => {
  const mesh = new MeshBuilder()
  mesh.polygon([
    rectangle({ x: 0, y: 0 }, 10, 10),
    rectangle({ x: 0, y: 0 }, 4, 4),
  ])
  expect(area(mesh.build())).toBeCloseTo(84)
})
test("rounded and rotated pads retain their areas", () => {
  const mesh = new MeshBuilder()
  mesh.polygon([rectangle({ x: 2, y: 3 }, 8, 4, 2, 37)])
  expect(area(mesh.build())).toBeCloseTo(16 + Math.PI * 4, 1)
})
test("bulge arcs expand in the correct direction", () => {
  const ring = expandBrepRing([
    { x: -1, y: 0, bulge: 1 },
    { x: 1, y: 0 },
  ])
  expect(Math.min(...ring.map((p) => p.y))).toBeCloseTo(-1)
  expect(Math.max(...ring.map((p) => p.y))).toBe(0)
})
test("circle tessellation has finite coordinates and correct area", () => {
  const mesh = new MeshBuilder()
  mesh.polygon([ellipse({ x: 0, y: 0 }, 4)])
  expect(area(mesh.build())).toBeCloseTo(Math.PI * 4, 1)
})
for (const [name, fixture] of Object.entries(fixtures))
  test(`compiles ${name} without missing geometry`, () => {
    const scene = compileCircuitJson(fixture.elements)
    expect(scene.diagnostics).toEqual([])
    expect(scene.triangleCount).toBeGreaterThan(0)
    for (const layer of scene.layers)
      for (const mesh of [layer.paint, layer.erase]) {
        expect([...mesh.vertices].every(Number.isFinite)).toBe(true)
        expect(
          [...mesh.indices].every((i) => i < mesh.vertices.length / 8),
        ).toBe(true)
      }
  })
test("reports unsupported shapes instead of silently hiding them", () => {
  const scene = compileCircuitJson([
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "bad",
      layer: "top",
      shape: "future_shape",
    },
  ] as any)
  expect(scene.diagnostics[0].elementId).toBe("bad")
})
test("AM3352 compiles without unsupported PCB geometry", () => {
  const scene = compileCircuitJson(large as any)
  expect(scene.diagnostics).toEqual([])
  expect(scene.triangleCount).toBeGreaterThan(100000)
})

test("wire-to-via segments stay on the adjacent layer without bridging other runs", () => {
  const scene = compileCircuitJson([
    {
      type: "pcb_trace",
      pcb_trace_id: "transition",
      route: [
        { route_type: "wire", x: 0, y: 0, width: 1, layer: "top" },
        {
          route_type: "via",
          x: 5,
          y: 0,
          from_layer: "top",
          to_layer: "bottom",
        },
        { route_type: "wire", x: 10, y: 0, width: 1, layer: "bottom" },
        { route_type: "wire", x: 100, y: 0, width: 1, layer: "inner1" },
      ],
    },
  ] as any)
  expect(scene.layers.map((l) => l.name).sort()).toEqual(["bottom", "top"])
  expect(area(scene.layers.find((l) => l.name === "top")!.paint)).toBeCloseTo(
    5 + Math.PI / 4,
    1,
  )
})

test("square holes compile, including rotated holes", () => {
  for (const ccw_rotation of [0, 45]) {
    const scene = compileCircuitJson([
      {
        type: "pcb_hole",
        pcb_hole_id: "square",
        hole_shape: "square",
        hole_diameter: 2,
        x: 0,
        y: 0,
        ccw_rotation,
      },
    ] as any)
    expect(scene.diagnostics).toEqual([])
    const erase = scene.layers.flatMap((l) => [...l.erase.vertices])
    expect(erase.length).toBeGreaterThan(0)
    expect(erase.every(Number.isFinite)).toBe(true)
  }
})

test("silkscreen graphics preserve filled areas, holes, arcs, layers, and IDs", () => {
  const scene = compileCircuitJson(silkscreenGraphics)
  expect(scene.diagnostics).toEqual([])
  expect(scene.elementIds).toEqual(["top-graphic", "bottom-graphic"])
  expect(scene.layers.map((layer) => layer.name)).toEqual([
    "top_silkscreen",
    "bottom_silkscreen",
  ])
  // Square with a circular hole; circle with two square holes.
  const expectedAreas = [144 - Math.PI * 9, Math.PI * 36 - 8]
  for (const [index, layer] of scene.layers.entries()) {
    expect(Math.abs(area(layer.paint) - expectedAreas[index])).toBeLessThan(
      0.15,
    )
    expect(layer.erase.indices.length).toBe(0)
    const xs = []
    for (let i = 0; i < layer.paint.vertices.length; i += 8) {
      xs.push(layer.paint.vertices[i])
      expect(layer.paint.vertices[i + 6]).toBe(index)
    }
    expect(Math.min(...xs)).toBeCloseTo(index === 0 ? -18 : 6)
    expect(Math.max(...xs)).toBeCloseTo(index === 0 ? -6 : 18)
  }
})

test("silkscreen graphics without inner rings remain filled", () => {
  const graphic = silkscreenGraphics[0]
  const scene = compileCircuitJson([
    {
      ...graphic,
      brep_shape: {
        outer_ring: graphic.brep_shape.outer_ring,
        inner_rings: [],
      },
    },
  ])
  expect(scene.diagnostics).toEqual([])
  expect(area(scene.layers[0].paint)).toBeCloseTo(144)
})

test("unsupported silkscreen graphic shapes still report a diagnostic", () => {
  const scene = compileCircuitJson([
    {
      ...silkscreenGraphics[0],
      shape: "future_shape",
    },
  ] as any)
  expect(scene.diagnostics).toHaveLength(1)
  expect(scene.diagnostics[0].elementId).toBe("top-graphic")
  expect(scene.triangleCount).toBe(0)
})

test("keepouts overlay later copper with translucent fill and clipped stripes on every layer", () => {
  const scene = compileCircuitJson(fixtures["keepouts-top"].elements)
  expect(scene.diagnostics).toEqual([])
  for (const name of ["top", "inner1", "bottom"]) {
    const mesh = scene.layers.find((layer) => layer.name === name)!.paint
    const keepoutIndex = scene.elementIds.indexOf("mounting-keepout")
    const pourIndex = scene.elementIds.indexOf(`keepout-pour-${name}`)
    const vertices = Array.from(
      { length: mesh.vertices.length / 8 },
      (_, i) => [...mesh.vertices.slice(i * 8, i * 8 + 8)],
    )
    const marking = vertices.filter((v) => v[6] === keepoutIndex)
    expect(marking.some((v) => Math.abs(v[5] - 0.2) < 1e-6)).toBe(true)
    expect(marking.some((v) => v[5] === 1)).toBe(true)
    expect(vertices.findIndex((v) => v[6] === keepoutIndex)).toBeGreaterThan(
      vertices.length -
        1 -
        [...vertices].reverse().findIndex((v) => v[6] === pourIndex),
    )
    for (const v of marking)
      expect(Math.hypot(v[0] + 10, v[1])).toBeLessThanOrEqual(6.00001)
  }
})

test("keepout fill and stripes preserve holes in concave polygons", () => {
  const mesh = new MeshBuilder()
  drawKeepout(mesh, [
    [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 8 },
      { x: 0, y: 8 },
    ],
    rectangle({ x: 2, y: 2 }, 2, 2),
  ])
  let fillArea = 0,
    stripeArea = 0
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = mesh.indices
      .slice(i, i + 3)
      .map((j) => ({ x: mesh.vertices[j * 8], y: mesh.vertices[j * 8 + 1] }))
    const center = {
      x: triangle.reduce((s, p) => s + p.x, 0) / 3,
      y: triangle.reduce((s, p) => s + p.y, 0) / 3,
    }
    expect(center.x > 4 && center.y > 4).toBe(false)
    expect(center.x > 1 && center.x < 3 && center.y > 1 && center.y < 3).toBe(
      false,
    )
    const [a, b, c] = triangle
    const area =
      Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
    if (mesh.vertices[mesh.indices[i] * 8 + 5] === 0.2) fillArea += area
    else stripeArea += area
  }
  expect(fillArea).toBeCloseTo(44)
  expect(stripeArea).toBeGreaterThan(0)
  expect(stripeArea).toBeLessThan(fillArea)
})
