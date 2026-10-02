import { parseColor } from "./colors"
import { MeshBuilder } from "./geometry"
import { drawText } from "./text/draw-text"
import type { Point } from "./types"
import { applyToPoint, rotateDEG } from "transformation-matrix"

type DimensionElement = Record<string, unknown> & {
  arrow_size?: number
  color?: string
  font_size?: number
  from: Point
  offset_direction?: Point
  offset_distance?: number
  text?: string
  text_ccw_rotation?: number
  to: Point
  type: string
}

export function isDimensionElement(
  element: Record<string, unknown>,
): element is DimensionElement {
  return (
    typeof element.type === "string" &&
    isPoint(element.from) &&
    isPoint(element.to)
  )
}

const TEXT_OFFSET_MULTIPLIER = 1.5
const CHARACTER_WIDTH_MULTIPLIER = 0.6
const TEXT_INTERSECTION_PADDING_MULTIPLIER = 0.3

export function drawDimension(params: {
  element: DimensionElement
  mesh: MeshBuilder
  textYAxis?: "up" | "down"
}): void {
  const { element, mesh } = params
  if (element.color) mesh.color = parseColor(element.color)

  const direction = normalize({
    x: element.to.x - element.from.x,
    y: element.to.y - element.from.y,
  })
  const perpendicular = { x: -direction.y, y: direction.x }
  const offsetDirection = normalize(element.offset_direction ?? { x: 0, y: 0 })
  const offsetDistance = element.offset_distance ?? 0
  const offset = {
    x: offsetDirection.x * offsetDistance,
    y: offsetDirection.y * offsetDistance,
  }
  const from = addPoints(element.from, offset)
  const to = addPoints(element.to, offset)
  const arrowSize = element.arrow_size ?? 1
  const strokeWidth = arrowSize / 5
  const fromBase = addPoints(from, scalePoint(direction, arrowSize))
  const toBase = addPoints(to, scalePoint(direction, -arrowSize))

  mesh.polygon([
    [
      from,
      addPoints(fromBase, scalePoint(perpendicular, arrowSize / 2)),
      addPoints(fromBase, scalePoint(perpendicular, -arrowSize / 2)),
    ],
  ])
  mesh.polygon([
    [
      to,
      addPoints(toBase, scalePoint(perpendicular, arrowSize / 2)),
      addPoints(toBase, scalePoint(perpendicular, -arrowSize / 2)),
    ],
  ])
  mesh.line(fromBase, toBase, strokeWidth)

  const extensionDirection =
    element.offset_direction &&
    (Math.abs(offsetDirection.x) > Number.EPSILON ||
      Math.abs(offsetDirection.y) > Number.EPSILON)
      ? offsetDirection
      : perpendicular
  const extensionLength = offsetDistance + arrowSize
  for (const anchor of [element.from, element.to]) {
    mesh.line(
      anchor,
      addPoints(anchor, scalePoint(extensionDirection, extensionLength)),
      strokeWidth,
    )
  }

  if (!element.text) return
  const fontSize = element.font_size ?? 1
  const textRotation = getTextRotation({
    direction,
    requestedRotation: element.text_ccw_rotation,
  })
  const textOffset =
    arrowSize * TEXT_OFFSET_MULTIPLIER +
    getRotatedTextClearance({
      fontSize,
      rotationDegrees: element.text_ccw_rotation,
      text: element.text,
    })
  const midpoint = {
    x: (element.from.x + element.to.x) / 2 + offset.x,
    y: (element.from.y + element.to.y) / 2 + offset.y,
  }
  drawText(
    mesh,
    {
      anchor_alignment: "center",
      anchor_position: addPoints(
        midpoint,
        scalePoint(perpendicular, textOffset),
      ),
      ccw_rotation: textRotation,
      font_size: fontSize,
      text: element.text,
      type: `${element.type}_text`,
    },
    params.textYAxis,
  )
}

function getTextRotation(params: {
  direction: Point
  requestedRotation?: number
}): number {
  let directionDegrees =
    (Math.atan2(params.direction.y, params.direction.x) * 180) / Math.PI
  if (directionDegrees > 90 || directionDegrees < -90) directionDegrees += 180
  return directionDegrees - (params.requestedRotation ?? 0)
}

function getRotatedTextClearance(params: {
  fontSize: number
  rotationDegrees?: number
  text: string
}): number {
  if (
    params.rotationDegrees === undefined ||
    !Number.isFinite(params.rotationDegrees)
  )
    return 0
  const halfWidth =
    (params.text.length * params.fontSize * CHARACTER_WIDTH_MULTIPLIER) / 2
  const halfHeight = params.fontSize / 2
  const rotation = rotateDEG(params.rotationDegrees)
  const horizontalExtent = applyToPoint(rotation, { x: halfWidth, y: 0 })
  const verticalExtent = applyToPoint(rotation, { x: 0, y: halfHeight })
  const maximumExtension =
    Math.abs(horizontalExtent.y) + Math.abs(verticalExtent.y)
  return (
    maximumExtension + params.fontSize * TEXT_INTERSECTION_PADDING_MULTIPLIER
  )
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y) || 1
  return { x: point.x / length, y: point.y / length }
}

function addPoints(first: Point, second: Point): Point {
  return { x: first.x + second.x, y: first.y + second.y }
}

function scalePoint(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale }
}

function isPoint(point: unknown): point is Point {
  return (
    typeof point === "object" &&
    point !== null &&
    "x" in point &&
    typeof point.x === "number" &&
    "y" in point &&
    typeof point.y === "number"
  )
}
