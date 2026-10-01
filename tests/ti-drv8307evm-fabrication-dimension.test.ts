import { expect, test } from "bun:test"
import { compileCircuitJson } from "../lib"

test("TI DRV8307EVM fabrication dimensions compile as WebGPU geometry", () => {
  const scene = compileCircuitJson([
    {
      type: "pcb_board",
      pcb_board_id: "drv8307evm-board",
      center: { x: 30.2641, y: 27.1399 },
      width: 60.5282,
      height: 54.2798,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "pcb_fabrication_note_dimension",
      pcb_fabrication_note_dimension_id: "drv8307evm-dimension-1000mil",
      pcb_component_id: "drv8307evm-board-graphics",
      layer: "top",
      from: { x: 17.5641, y: 27.1399 },
      to: { x: 42.9641, y: 27.1399 },
      text: "1000.00 mil",
      offset_distance: 0,
      offset_direction: { x: 0, y: 1 },
      font: "tscircuit2024",
      font_size: 1.524,
      arrow_size: 1.524,
      color: "#ec4899",
    },
  ])

  expect(scene.diagnostics).toEqual([])
  const fabricationLayer = scene.layers.find(
    ({ name }) => name === "top_fabrication",
  )
  expect(fabricationLayer).toBeDefined()
  expect(fabricationLayer?.paint.indices.length).toBeGreaterThan(0)
  const dimensionElementIndex = scene.elementIds.indexOf(
    "drv8307evm-dimension-1000mil",
  )
  const renderedElementIndexes = Array.from(
    fabricationLayer?.paint.vertices ?? [],
  ).filter((_, index) => index % 8 === 6)
  expect(renderedElementIndexes).toContain(dimensionElementIndex)
})
