import { parseColor } from "../colors"
import type { MeshBuilder } from "../geometry"
import { drawText } from "../text/draw-text"
import type { DrawerOptions } from "../types"
import {
  getPcbDimensionGeometry,
  type PcbDimension,
} from "./get-pcb-dimension-geometry"

export function drawPcbDimension({
  mesh,
  pcbDimension,
  textYAxis,
}: {
  mesh: MeshBuilder
  pcbDimension: PcbDimension
  textYAxis?: DrawerOptions["textYAxis"]
}): void {
  if (pcbDimension.color) mesh.color = parseColor(pcbDimension.color)

  const { arrowPolygons, dimensionLine, extensionLines, label } =
    getPcbDimensionGeometry({ pcbDimension })

  for (const arrowPolygon of arrowPolygons) mesh.polygon([arrowPolygon])
  mesh.line(dimensionLine.start, dimensionLine.end, dimensionLine.width)
  for (const extensionLine of extensionLines) {
    mesh.line(extensionLine.start, extensionLine.end, dimensionLine.width)
  }

  if (!label) return
  drawText(
    mesh,
    {
      anchor_alignment: "center",
      anchor_position: label.anchorPosition,
      ccw_rotation: label.ccwRotationDegrees,
      font_size: label.fontSize,
      text: label.text,
      type: "pcb_dimension_text",
    },
    textYAxis,
  )
}
