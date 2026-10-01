import { createBoardOwnerMap } from "@tscircuit/circuit-json-util"
import type { PcbVia, PcbViaInput } from "circuit-json"
import {
  getWireTaperPolygon,
  getWireTaperSegments,
  hasWireTaper,
} from "./get-wire-taper-polygon"
import { drawKeepout } from "./draw-keepout"
import { drawText } from "./text/draw-text"
import { DEFAULT_LAYER_COLORS, normalizeLayer, parseColor } from "./colors"
import {
  ellipse,
  expandBrepRing,
  MeshBuilder,
  rectangle,
  rotate,
} from "./geometry"
import type { CircuitJson, CompiledScene, Diagnostic, Point } from "./types"

type Element = Record<string, any>
export function getElementId(element: Element, index = 0): string {
  return element[`${element.type}_id`] ?? `${element.type}:${index}`
}
function center(e: Element): Point {
  return e.center ?? e.anchor_position ?? { x: e.x ?? 0, y: e.y ?? 0 }
}
function shape(e: Element, hole = false): Point[][] {
  if (e.brep_shape)
    return [e.brep_shape.outer_ring, ...(e.brep_shape.inner_rings ?? [])].map(
      (r) => expandBrepRing(r.vertices),
    )
  if (e.outline?.length) return [e.outline]
  const kind = hole ? (e.hole_shape ?? e.shape) : e.shape
  if (kind === "polygon") return [e.points ?? e.vertices ?? []]
  const base = center(e),
    rotation = e.rect_ccw_rotation ?? e.ccw_rotation ?? e.rotation ?? 0
  const c = hole
    ? rotate(
        {
          x: base.x + (e.hole_offset_x ?? 0),
          y: base.y + (e.hole_offset_y ?? 0),
        },
        base,
        rotation,
      )
    : base
  if (
    kind === "circle" ||
    (kind === "circular_hole_with_rect_pad" && hole) ||
    e.type === "pcb_via"
  ) {
    const diameter = hole
      ? e.hole_diameter
      : (e.outer_diameter ?? (e.radius != null ? e.radius * 2 : e.diameter))
    return [
      ellipse(c, diameter || e.diameter || e.hole_diameter || e.radius * 2),
    ]
  }
  const width = hole
    ? (e.hole_width ?? e.hole_diameter)
    : (e.rect_pad_width ?? e.outer_width ?? e.width ?? e.hole_diameter)
  const height = hole
    ? (e.hole_height ?? e.hole_diameter)
    : (e.rect_pad_height ?? e.outer_height ?? e.height ?? e.hole_diameter)
  if (kind === "oval") return [ellipse(c, width, height, rotation)]
  if (
    [
      "rect",
      "square",
      "rotated_rect",
      "roundrect",
      "rounded_rect",
      "pill",
      "rotated_pill",
      "circular_hole_with_rect_pad",
      "pill_hole_with_rect_pad",
      undefined,
    ].includes(kind)
  ) {
    const pill =
      kind?.includes("pill") && !(kind === "pill_hole_with_rect_pad" && !hole)
    const radius = pill
      ? Math.min(width, height) / 2
      : (e.corner_radius ?? e.rect_border_radius ?? 0)
    return [rectangle(c, width, height, radius, rotation)]
  }
  throw new Error(`Unsupported shape: ${kind}`)
}
/** Pure, DOM-free compiler. Exposes unsupported geometry rather than silently hiding it. */
export function compileCircuitJson(
  elements: CircuitJson,
  options: {
    textYAxis?: "up" | "down"
    layerColors?: Record<string, import("./types").Color>
  } = {},
): CompiledScene {
  const boardOwners = createBoardOwnerMap([...elements])
  const viasByPosition = new Map<string, PcbVia[]>()
  const renderElements = elements.map((element, index) => ({ element, index }))
  for (const element of elements) {
    if (element.type !== "pcb_via") continue
    const board = boardOwners.get(element.pcb_via_id)
    const key = JSON.stringify([board?.pcb_board_id, element.x, element.y])
    const vias = viasByPosition.get(key) ?? []
    vias.push(element)
    viasByPosition.set(key, vias)
  }
  for (const [index, trace] of elements.entries()) {
    if (trace.type !== "pcb_trace") continue
    const board = boardOwners.get(trace.pcb_trace_id)
    for (const [routeIndex, point] of trace.route.entries()) {
      if (point.route_type !== "via") continue
      const key = JSON.stringify([board?.pcb_board_id, point.x, point.y])
      const vias = viasByPosition.get(key) ?? []
      if (
        vias.some(
          (via) =>
            via.layers.includes(point.from_layer) &&
            via.layers.includes(point.to_layer),
        )
      )
        continue
      const via: PcbVia = {
        type: "pcb_via",
        pcb_via_id: `${trace.pcb_trace_id}_route_via_${routeIndex}`,
        pcb_trace_id: trace.pcb_trace_id,
        x: point.x,
        y: point.y,
        layers: [point.from_layer, point.to_layer],
        hole_diameter:
          point.hole_diameter ?? board?.min_via_hole_diameter ?? 0.25,
        outer_diameter:
          point.outer_diameter ?? board?.min_via_pad_diameter ?? 0.6,
        tented_on_top: point.tented_on_top,
        tented_on_bottom: point.tented_on_bottom,
      }
      vias.push(via)
      viasByPosition.set(key, vias)
      // Keep picking and X-Ray selection associated with the owning trace.
      renderElements.push({ element: via, index })
    }
  }
  const isViaTented = (via: PcbViaInput, side: "top" | "bottom") => {
    const board =
      (via.pcb_via_id ? boardOwners.get(via.pcb_via_id) : undefined) ??
      (via.pcb_trace_id ? boardOwners.get(via.pcb_trace_id) : undefined)
    return (
      (side === "top" ? via.tented_on_top : via.tented_on_bottom) ??
      via.is_tented ??
      (side === "top"
        ? board?.default_via_tented_on_top
        : board?.default_via_tented_on_bottom) ??
      false
    )
  }
  const builders = new Map<string, { paint: MeshBuilder; erase: MeshBuilder }>()
  const diagnostics: Diagnostic[] = [],
    elementIds = elements.map(getElementId)
  const board = elements.find((e) => e.type === "pcb_board") as
    | Element
    | undefined
  const copper = [
    "top",
    ...Array.from(
      { length: Math.max(0, Math.min(8, (board?.num_layers ?? 2) - 2)) },
      (_, i) => `inner${i + 1}`,
    ),
    "bottom",
  ]
  const get = (name: string, index: number, erase = false, category = 0) => {
    name = normalizeLayer(name)
    if (!builders.has(name))
      builders.set(name, { paint: new MeshBuilder(), erase: new MeshBuilder() })
    const mesh = builders.get(name)![erase ? "erase" : "paint"]
    const colorLayer = name.startsWith("drill_") ? "drill" : name
    mesh.color = options.layerColors?.[colorLayer] ??
      DEFAULT_LAYER_COLORS[colorLayer] ?? [0.75, 0.75, 0.75, 1]
    mesh.element = index
    mesh.category = category
    return mesh
  }
  const openings: { element: Element; index: number; layers: string[] }[] = []
  const keepouts: { rings: Point[][]; index: number; layers: string[] }[] = []
  const cutouts: { rings: Point[][]; index: number }[] = []
  for (const { index, element: input } of renderElements) {
    const e = input as Element,
      type: string = e.type
    try {
      if (type === "pcb_board" || type === "pcb_panel") {
        const rings = shape(e)
        get("board", index).polygon(rings)
        for (const ring of rings) get("edge_cuts", index).path(ring, 0.1, true)
        for (const side of ["top", "bottom"])
          get(`soldermask_${side}`, index).polygon(rings)
      } else if (type === "pcb_cutout") {
        cutouts.push({ rings: shape(e), index })
        get("edge_cuts", index).path(shape(e)[0], 0.05, true)
      } else if (type === "pcb_smtpad") {
        get(e.layer, index).polygon(shape(e))
        if (!e.is_covered_with_solder_mask)
          get(`soldermask_${e.layer}`, index, true).polygon(shape(e))
      } else if (type === "pcb_via" || type === "pcb_plated_hole") {
        let layers: string[] = e.layers ?? copper
        if (type === "pcb_via" && !e.layers && e.from_layer && e.to_layer) {
          const from = copper.indexOf(e.from_layer),
            to = copper.indexOf(e.to_layer)
          layers = copper.slice(Math.min(from, to), Math.max(from, to) + 1)
        }
        for (const layer of layers) get(layer, index).polygon(shape(e))
        openings.push({ element: e, index, layers })
        for (const side of ["top", "bottom"] as const) {
          if (!layers.includes(side)) continue
          const tented =
            type === "pcb_via" && isViaTented(e as PcbViaInput, side)
          if (tented) get(`soldermask_${side}`, index).polygon(shape(e))
          else if (!e.is_covered_with_solder_mask)
            get(`soldermask_${side}`, index, true).polygon(shape(e))
        }
      } else if (type === "pcb_hole") {
        openings.push({
          element: { ...e, shape: e.hole_shape },
          index,
          layers: copper,
        })
      } else if (type === "pcb_trace") {
        const route = e.route ?? []
        if (
          (e.route_thickness_mode === "interpolated" &&
            route.some(
              (p: Element, i: number) =>
                p.route_type === "wire" &&
                !hasWireTaper(p) &&
                route[i + 1]?.route_type === "wire",
            )) ||
          route.some((p: Element) => p.route_type === "through_pad")
        )
          throw new Error(
            "Interpolated/through-pad traces are not supported yet",
          )
        for (const point of getWireTaperSegments(route)) {
          const polygon = getWireTaperPolygon(point)
          if (!polygon.length)
            throw new Error("Invalid teardrop geometry or interpolation mode")
          get(point.layer, index).polygon([polygon])
        }
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1],
            b = route[i]
          if (hasWireTaper(a)) continue
          // Connect wires to a via on the adjacent copper layer, but never
          // connect two unrelated runs across a layer transition.
          const layer =
            a.route_type === "wire" &&
            b.route_type === "wire" &&
            a.layer === b.layer
              ? a.layer
              : a.route_type === "wire" &&
                  b.route_type === "via" &&
                  [b.from_layer, b.to_layer].includes(a.layer)
                ? a.layer
                : a.route_type === "via" &&
                    b.route_type === "wire" &&
                    [a.from_layer, a.to_layer].includes(b.layer)
                  ? b.layer
                  : undefined
          if (layer) get(layer, index).line(a, b, a.width ?? b.width ?? 0.15)
        }
      } else if (type === "pcb_copper_pour") {
        get(e.layer, index, false, 1).polygon(shape(e))
      } else if (type === "pcb_copper_text") {
        drawText(get(e.layer, index), e, options.textYAxis)
      } else if (
        /^pcb_(silkscreen|fabrication_note|courtyard|note|user_note)_/.test(
          type,
        )
      ) {
        const group = type.match(
          /^pcb_(silkscreen|fabrication_note|courtyard|note|user_note)_/,
        )![1]
        const suffix = {
          silkscreen: "silkscreen",
          fabrication_note: "fabrication",
          courtyard: "courtyard",
          note: "notes",
          user_note: "notes",
        }[group]!
        const layer = `${e.layer ?? "top"}_${suffix}`,
          mesh = get(layer, index)
        if (type.endsWith("_text")) {
          if (e.color && (group === "note" || group === "fabrication_note"))
            mesh.color = parseColor(e.color)
          drawText(mesh, e, options.textYAxis)
        } else if (
          type.endsWith("_path") ||
          type.endsWith("_line") ||
          type.endsWith("_outline")
        ) {
          const points =
            e.route ?? e.points ?? e.outline ?? [e.start, e.end].filter(Boolean)
          mesh.path(
            points,
            e.stroke_width ?? e.width ?? 0.05,
            type.endsWith("_outline"),
          )
        } else if (type === "pcb_silkscreen_graphic" && e.shape === "brep") {
          mesh.polygon(shape(e))
        } else if (type.endsWith("_rect")) {
          const points = rectangle(
            center(e),
            e.width,
            e.height,
            e.corner_radius ?? 0,
            e.ccw_rotation ?? 0,
          )
          if (e.is_filled) mesh.polygon([points])
          else mesh.path(points, e.stroke_width ?? 0.05, true)
        } else if (type.endsWith("_circle")) {
          const points = ellipse(center(e), (e.radius ?? 0) * 2)
          if (e.is_filled) mesh.polygon([points])
          else mesh.path(points, e.stroke_width ?? 0.05, true)
        } else throw new Error("Unsupported annotation geometry")
      } else if (type === "pcb_keepout") {
        keepouts.push({
          rings: shape(e),
          index,
          layers: e.layers ?? [e.layer ?? "top"],
        })
      } else if (
        type.startsWith("pcb_") &&
        ![
          "pcb_component",
          "pcb_port",
          "pcb_group",
          "pcb_solder_paste",
          "pcb_debug_object",
          "pcb_trace_hint",
          "pcb_anchor",
        ].includes(type) &&
        !/_(error|warning)$/.test(type)
      ) {
        throw new Error("Unsupported PCB element")
      }
    } catch (error) {
      diagnostics.push({
        elementId: elementIds[index],
        type,
        message: String(error),
      })
    }
  }
  // Keep annotations visible regardless of the input order of copper pours.
  for (const { rings, index, layers } of keepouts) {
    try {
      for (const layer of layers) drawKeepout(get(layer, index), rings)
    } catch (error) {
      diagnostics.push({
        elementId: elementIds[index],
        type: "pcb_keepout",
        message: String(error),
      })
    }
  }
  const hasTentedVias = openings.some(
    ({ element }) =>
      element.type === "pcb_via" &&
      (isViaTented(element as PcbViaInput, "top") ||
        isViaTented(element as PcbViaInput, "bottom")),
  )
  if (hasTentedVias) {
    // Retain the full physical drill mesh, plus visible openings for each masked side.
    get("drill_top", 0)
    get("drill_bottom", 0)
  }
  for (const { element, index, layers } of openings) {
    const rings = shape(element, true)
    for (const layer of layers) get(layer, index, true).polygon(rings)
    const isThrough = layers.includes("top") && layers.includes("bottom")
    if (isThrough) {
      get("board", index, true).polygon(rings)
      get("drill", index).polygon(rings)
    }
    for (const side of ["top", "bottom"] as const)
      if (
        layers.includes(side) &&
        !(
          element.type === "pcb_via" &&
          isViaTented(element as PcbViaInput, side)
        )
      ) {
        get(`soldermask_${side}`, index, true).polygon(rings)
        if (isThrough && hasTentedVias)
          get(`drill_${side}`, index).polygon(rings)
      }
  }
  for (const { rings, index } of cutouts)
    for (const name of builders.keys())
      if (name !== "edge_cuts") get(name, index, true).polygon(rings)
  const layers = [...builders].map(([name, mesh]) => ({
    name,
    paint: mesh.paint.build(),
    erase: mesh.erase.build(),
  }))
  return {
    layers,
    elementIds,
    diagnostics,
    triangleCount: layers.reduce(
      (sum, l) => sum + (l.paint.indices.length + l.erase.indices.length) / 3,
      0,
    ),
  }
}
