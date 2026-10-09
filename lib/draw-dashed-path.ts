import type { MeshBuilder } from "./geometry"
import type { Point } from "./types"

export function drawDashedPath(
  {
    points,
    width,
    dashLength,
    gapLength,
    closed = false,
    roundCaps = false,
  }: {
    points: Point[]
    width: number
    dashLength: number
    gapLength: number
    closed?: boolean
    roundCaps?: boolean
  },
  mesh: MeshBuilder,
) {
  if (!(width > 0 && dashLength > 0 && gapLength > 0)) return
  const route = closed && points.length > 2 ? [...points, points[0]] : points
  let drawing = true
  let remaining = dashLength
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!length) continue
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length
    let offset = 0
    while (offset < length) {
      const step = Math.min(remaining, length - offset)
      if (drawing) {
        const start = { x: a.x + dx * offset, y: a.y + dy * offset }
        const end = {
          x: a.x + dx * (offset + step),
          y: a.y + dy * (offset + step),
        }
        if (roundCaps) mesh.line(start, end, width)
        else {
          const nx = (-dy * width) / 2,
            ny = (dx * width) / 2
          mesh.polygon([
            [
              { x: start.x + nx, y: start.y + ny },
              { x: end.x + nx, y: end.y + ny },
              { x: end.x - nx, y: end.y - ny },
              { x: start.x - nx, y: start.y - ny },
            ],
          ])
        }
      }
      offset += step
      remaining -= step
      if (remaining === 0) {
        drawing = !drawing
        remaining = drawing ? dashLength : gapLength
      }
    }
  }
}
