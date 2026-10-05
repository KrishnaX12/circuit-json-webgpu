import { midpoint } from "@tscircuit/math-utils"
import type {
  PcbFabricationNoteDimension,
  PcbNoteDimension,
} from "circuit-json"
import {
  applyToPoint,
  rotateDEG,
  scale,
  translate,
} from "transformation-matrix"
import type { Point } from "../types"

export type PcbDimension = PcbFabricationNoteDimension | PcbNoteDimension

type LineSegment = {
  start: Point
  end: Point
}

type DimensionLabel = {
  anchorPosition: Point
  ccwRotationDegrees: number
  fontSize: number
  text: string
}

export type PcbDimensionGeometry = {
  arrowPolygons: [Point[], Point[]]
  dimensionLine: LineSegment & { width: number }
  extensionLines: [LineSegment, LineSegment]
  label?: DimensionLabel
}

const TEXT_OFFSET_MULTIPLIER = 1.5
const CHARACTER_WIDTH_MULTIPLIER = 0.6
const TEXT_INTERSECTION_PADDING_MULTIPLIER = 0.3

export function getPcbDimensionGeometry({
  pcbDimension,
}: {
  pcbDimension: PcbDimension
}): PcbDimensionGeometry {
  const dimensionDirection = normalizeVector({
    x: pcbDimension.to.x - pcbDimension.from.x,
    y: pcbDimension.to.y - pcbDimension.from.y,
  })
  const perpendicularDirection = applyToPoint(rotateDEG(90), dimensionDirection)
  const offsetDirection = normalizeVector(
    pcbDimension.offset_direction ?? { x: 0, y: 0 },
  )
  const offsetDistance = pcbDimension.offset_distance ?? 0
  const offsetVector = scaleVector(offsetDirection, offsetDistance)
  const dimensionStart = translatePoint(pcbDimension.from, offsetVector)
  const dimensionEnd = translatePoint(pcbDimension.to, offsetVector)
  const arrowSize = pcbDimension.arrow_size ?? 1
  const dimensionStartArrowBase = translatePoint(
    dimensionStart,
    scaleVector(dimensionDirection, arrowSize),
  )
  const dimensionEndArrowBase = translatePoint(
    dimensionEnd,
    scaleVector(dimensionDirection, -arrowSize),
  )
  const arrowHalfWidthVector = scaleVector(
    perpendicularDirection,
    arrowSize / 2,
  )
  const negativeArrowHalfWidthVector = scaleVector(
    perpendicularDirection,
    -arrowSize / 2,
  )
  const extensionDirection = hasDirection(offsetDirection)
    ? offsetDirection
    : perpendicularDirection
  const extensionVector = scaleVector(
    extensionDirection,
    offsetDistance + arrowSize,
  )
  const dimensionMidpoint = translatePoint(
    midpoint(pcbDimension.from, pcbDimension.to),
    offsetVector,
  )
  const fontSize = pcbDimension.font_size ?? 1
  const textOffsetDistance =
    arrowSize * TEXT_OFFSET_MULTIPLIER +
    getRotatedTextClearance({
      fontSize,
      text: pcbDimension.text ?? "",
      textCcwRotationDegrees: pcbDimension.text_ccw_rotation,
    })

  return {
    arrowPolygons: [
      [
        dimensionStart,
        translatePoint(dimensionStartArrowBase, arrowHalfWidthVector),
        translatePoint(dimensionStartArrowBase, negativeArrowHalfWidthVector),
      ],
      [
        dimensionEnd,
        translatePoint(dimensionEndArrowBase, arrowHalfWidthVector),
        translatePoint(dimensionEndArrowBase, negativeArrowHalfWidthVector),
      ],
    ],
    dimensionLine: {
      start: dimensionStartArrowBase,
      end: dimensionEndArrowBase,
      width: arrowSize / 5,
    },
    extensionLines: [
      {
        start: pcbDimension.from,
        end: translatePoint(pcbDimension.from, extensionVector),
      },
      {
        start: pcbDimension.to,
        end: translatePoint(pcbDimension.to, extensionVector),
      },
    ],
    label: pcbDimension.text
      ? {
          anchorPosition: translatePoint(
            dimensionMidpoint,
            scaleVector(perpendicularDirection, textOffsetDistance),
          ),
          ccwRotationDegrees: getLabelCcwRotationDegrees({
            dimensionDirection,
            requestedCcwRotationDegrees: pcbDimension.text_ccw_rotation,
          }),
          fontSize,
          text: pcbDimension.text,
        }
      : undefined,
  }
}

function getLabelCcwRotationDegrees({
  dimensionDirection,
  requestedCcwRotationDegrees,
}: {
  dimensionDirection: Point
  requestedCcwRotationDegrees?: number
}): number {
  let dimensionCcwRotationDegrees =
    (Math.atan2(dimensionDirection.y, dimensionDirection.x) * 180) / Math.PI
  if (dimensionCcwRotationDegrees > 90 || dimensionCcwRotationDegrees < -90) {
    dimensionCcwRotationDegrees += 180
  }

  // drawText creates y-up geometry that the camera maps to screen space. Adding
  // the requested CCW rotation here matches circuit-to-canvas after that flip.
  return dimensionCcwRotationDegrees + (requestedCcwRotationDegrees ?? 0)
}

function getRotatedTextClearance({
  fontSize,
  text,
  textCcwRotationDegrees,
}: {
  fontSize: number
  text: string
  textCcwRotationDegrees?: number
}): number {
  if (
    textCcwRotationDegrees === undefined ||
    !Number.isFinite(textCcwRotationDegrees)
  ) {
    return 0
  }

  const halfWidth = (text.length * fontSize * CHARACTER_WIDTH_MULTIPLIER) / 2
  const halfHeight = fontSize / 2
  const textCcwRotationTransform = rotateDEG(textCcwRotationDegrees)
  const horizontalExtentVector = applyToPoint(textCcwRotationTransform, {
    x: halfWidth,
    y: 0,
  })
  const verticalExtentVector = applyToPoint(textCcwRotationTransform, {
    x: 0,
    y: halfHeight,
  })
  return (
    Math.abs(horizontalExtentVector.y) +
    Math.abs(verticalExtentVector.y) +
    fontSize * TEXT_INTERSECTION_PADDING_MULTIPLIER
  )
}

function normalizeVector(vector: Point): Point {
  const vectorLength = Math.hypot(vector.x, vector.y) || 1
  return applyToPoint(scale(1 / vectorLength), vector)
}

function scaleVector(vector: Point, scaleFactor: number): Point {
  return applyToPoint(scale(scaleFactor), vector)
}

function translatePoint(point: Point, translation: Point): Point {
  return applyToPoint(translate(translation.x, translation.y), point)
}

function hasDirection(direction: Point): boolean {
  return (
    Math.abs(direction.x) > Number.EPSILON ||
    Math.abs(direction.y) > Number.EPSILON
  )
}
