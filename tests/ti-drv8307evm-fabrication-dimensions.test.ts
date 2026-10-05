import { expect, test } from "bun:test"
import type { CircuitJson } from "../lib"
import { compileCircuitJson } from "../lib"
import drv8307EvmFabricationDimensions from "./fixtures/drv8307evm-fabrication-dimensions.circuit.json"

test("renders the fabrication dimensions converted from TI DRV8307EVM", () => {
  const circuitJson = drv8307EvmFabricationDimensions as CircuitJson
  const scene = compileCircuitJson(circuitJson)
  const fabricationLayer = scene.layers.find(
    ({ name }) => name === "top_fabrication",
  )
  const renderedElementIndexes = new Set(
    Array.from(fabricationLayer?.paint.vertices ?? []).filter(
      (_, index) => index % 8 === 6,
    ),
  )
  const fabricationDimensionIds = circuitJson.flatMap((element) =>
    element.type === "pcb_fabrication_note_dimension"
      ? [element.pcb_fabrication_note_dimension_id]
      : [],
  )

  expect(
    scene.diagnostics.filter(
      ({ type }) => type === "pcb_fabrication_note_dimension",
    ),
  ).toEqual([])
  expect(fabricationDimensionIds).toHaveLength(2)
  for (const fabricationDimensionId of fabricationDimensionIds) {
    expect(renderedElementIndexes).toContain(
      scene.elementIds.indexOf(fabricationDimensionId),
    )
  }
})
