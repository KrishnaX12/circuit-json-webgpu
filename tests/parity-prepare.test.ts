import assert from "node:assert/strict"
import { test, expect } from "bun:test"
import { prepareComparison } from "./parity/prepare.ts"
const fixture = {
  width: 400,
  height: 200,
  matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  contextTransform: { a: 4, b: 0, c: 0, d: 4, e: 0, f: 0 },
  options: {},
  elements: [
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad",
      shape: "rect",
      x: 50,
      y: 25,
      width: 5,
      height: 5,
      layer: "top",
    },
  ],
}
test("SVG and WebGPU share one viewport and canonical y-up camera", () => {
  const { scene } = prepareComparison(fixture)
  assert(scene)
  expect(scene.elements).toBe(fixture.elements)
  expect(scene.viewport).toEqual({ minX: 0, maxX: 100, minY: 0, maxY: 50 })
  expect(scene.transform).toEqual({ a: 4, b: 0, c: 0, d: -4, e: 0, f: 200 })
  expect(scene.background).toBe("#000000")
})
test("layer filtering supplies the same subset to both renderers", () => {
  const top = {
      type: "pcb_silkscreen_text",
      layer: "top",
      text: "Top",
      anchor_position: { x: 0, y: 0 },
    },
    bottom = { ...top, layer: "bottom", text: "Bottom" }
  const { scene } = prepareComparison({
    ...fixture,
    elements: [top, bottom, ...fixture.elements],
    options: { layers: ["top_silkscreen"] },
  })
  assert(scene)
  expect(scene.elements).toEqual([top])
  expect(scene.layer).toBe("top")
  expect(scene.layers).toContain("top_silkscreen")
})
test("Canvas-only passes are not mislabeled as SVG comparisons", () => {
  for (const extra of [
    { primitive: { shape: "circle" } },
    { sourceFunction: "drawPcbTrace" },
    { options: { clipContextElements: [] } },
    { options: { layers: ["top_soldermask"] } },
    { options: { layers: ["bottom_copper", "top_user_note"] } },
  ])
    expect(prepareComparison({ ...fixture, ...extra }).reason).toBeTruthy()
})

test("polygon-hole comparisons apply schema defaults without losing explicit offsets", () => {
  const hole = {
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "polygon-hole",
    shape: "hole_with_polygon_pad",
    x: 50,
    y: 25,
    hole_shape: "circle",
    hole_diameter: 2,
    pad_outline: [
      { x: -3, y: -3 },
      { x: 3, y: -3 },
      { x: 0, y: 3 },
    ],
    layers: ["top", "bottom"],
  }
  const { scene } = prepareComparison({ ...fixture, elements: [hole] })
  assert(scene)
  expect(scene.elements[0]).toMatchObject({
    hole_offset_x: 0,
    hole_offset_y: 0,
  })
  expect(hole).not.toHaveProperty("hole_offset_x")
  const offset = prepareComparison({
    ...fixture,
    elements: [{ ...hole, hole_offset_x: 5, hole_offset_y: -3 }],
  })
  assert(offset.scene)
  expect(offset.scene.elements[0]).toMatchObject({
    hole_offset_x: 5,
    hole_offset_y: -3,
  })
})
