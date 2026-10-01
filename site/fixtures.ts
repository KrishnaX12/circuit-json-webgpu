import { viaTenting } from "./via-tenting"
import { teardropDemo } from "./teardrop-demo"
import type { CircuitJson, RenderOptions } from "../lib"
export type Fixture = { elements: CircuitJson; options?: RenderOptions }
const board = {
  type: "pcb_board",
  pcb_board_id: "board",
  center: { x: 0, y: 0 },
  width: 48,
  height: 34,
  num_layers: 4,
  thickness: 1.6,
}
const pad = (id: string, x: number, y: number, extras = {}) => ({
  type: "pcb_smtpad",
  pcb_smtpad_id: id,
  shape: "rect",
  layer: "top",
  x,
  y,
  width: 4,
  height: 3,
  ...extras,
})
const trace = (id: string, layer: string, points: number[][]) => ({
  type: "pcb_trace",
  pcb_trace_id: id,
  route: points.map(([x, y]) => ({
    route_type: "wire",
    x,
    y,
    width: 0.5,
    layer,
  })),
})
const rectPads = [
  board,
  pad("rect", -15, 8),
  pad("circle", -5, 8, { shape: "circle", radius: 2 }),
  pad("pill", 5, 8, { shape: "pill", width: 7, height: 3 }),
  pad("rotated", 15, 8, { shape: "rotated_rect", ccw_rotation: 35 }),
  pad("rounded", -12, -6, {
    shape: "roundrect",
    width: 8,
    height: 5,
    corner_radius: 1,
  }),
  pad("rotated-pill", 0, -6, {
    shape: "rotated_pill",
    width: 8,
    height: 3,
    ccw_rotation: 55,
  }),
  pad("poly", 0, 0, {
    shape: "polygon",
    points: [
      { x: 9, y: -9 },
      { x: 16, y: -8 },
      { x: 18, y: -2 },
      { x: 10, y: -3 },
    ],
  }),
]
const holes = [
  board,
  {
    type: "pcb_hole",
    pcb_hole_id: "hole",
    hole_shape: "circle",
    x: -15,
    y: 0,
    hole_diameter: 3,
  },
  {
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "plated",
    shape: "circle",
    x: -5,
    y: 0,
    hole_diameter: 2,
    outer_diameter: 4,
    layers: ["top", "inner1", "inner2", "bottom"],
  },
  {
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "slot",
    shape: "pill",
    x: 5,
    y: 0,
    hole_width: 5,
    hole_height: 2,
    outer_width: 7,
    outer_height: 4,
    ccw_rotation: 35,
    layers: ["top", "bottom"],
  },
  {
    type: "pcb_plated_hole",
    pcb_plated_hole_id: "offset",
    shape: "circular_hole_with_rect_pad",
    x: 15,
    y: 0,
    hole_diameter: 2,
    rect_pad_width: 5,
    rect_pad_height: 4,
    rect_ccw_rotation: 30,
    hole_offset_x: 0.8,
    layers: ["top", "bottom"],
  },
]
const routing = [
  board,
  trace("top-route", "top", [
    [-18, -10],
    [-6, -10],
    [4, 0],
    [18, 0],
  ]),
  trace("bottom-route", "bottom", [
    [-18, 8],
    [0, 8],
    [15, -7],
  ]),
  trace("inner-route", "inner1", [
    [-18, 0],
    [0, 0],
    [18, 10],
  ]),
  {
    type: "pcb_via",
    pcb_via_id: "via",
    x: 0,
    y: 0,
    outer_diameter: 2,
    hole_diameter: 0.8,
    layers: ["top", "inner1", "inner2", "bottom"],
  },
]
const pours = [
  board,
  {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour",
    layer: "top",
    shape: "brep",
    brep_shape: {
      outer_ring: {
        vertices: [
          { x: -20, y: -12 },
          { x: 20, y: -12 },
          { x: 20, y: 12, bulge: 0.3 },
          { x: -20, y: 12 },
        ],
      },
      inner_rings: [
        {
          vertices: [
            { x: -7, y: -6 },
            { x: 7, y: -6 },
            { x: 7, y: 6 },
            { x: -7, y: 6 },
          ],
        },
      ],
    },
  },
  trace("through-hole", "bottom", [
    [-18, 0],
    [18, 0],
  ]),
]
const texts = [
  board,
  ...["top_left", "center", "bottom_right"].map((anchor_alignment, i) => ({
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: `text-${i}`,
    layer: "top",
    text: "PCB 123\nWebGPU",
    font_size: 2,
    anchor_position: { x: (i - 1) * 14, y: 4 },
    anchor_alignment,
    ccw_rotation: i === 1 ? 25 : 0,
  })),
  {
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "mirror",
    layer: "bottom",
    text: "BOTTOM",
    font_size: 2,
    anchor_position: { x: 0, y: -9 },
    anchor_alignment: "center",
  },
]
const annotations = [
  board,
  {
    type: "pcb_silkscreen_circle",
    pcb_silkscreen_circle_id: "circle",
    layer: "top",
    center: { x: -12, y: 0 },
    radius: 5,
    stroke_width: 0.2,
  },
  {
    type: "pcb_silkscreen_rect",
    pcb_silkscreen_rect_id: "rect",
    layer: "top",
    center: { x: 10, y: 0 },
    width: 10,
    height: 6,
    ccw_rotation: 20,
    stroke_width: 0.2,
  },
  {
    type: "pcb_courtyard_outline",
    pcb_courtyard_outline_id: "yard",
    layer: "top",
    outline: [
      { x: -19, y: -9 },
      { x: 19, y: -9 },
      { x: 19, y: 9 },
      { x: -19, y: 9 },
    ],
  },
  {
    type: "pcb_fabrication_note_path",
    pcb_fabrication_note_path_id: "fab",
    layer: "top",
    route: [
      { x: -20, y: -13 },
      { x: 0, y: -11 },
      { x: 20, y: -13 },
    ],
    stroke_width: 0.2,
  },
]
// Absolute PCB coordinates: bottom-side graphics must not be mirrored again.
export const silkscreenGraphics = [
  {
    type: "pcb_silkscreen_graphic",
    pcb_silkscreen_graphic_id: "top-graphic",
    pcb_component_id: "component",
    layer: "top",
    shape: "brep",
    brep_shape: {
      outer_ring: {
        vertices: [
          { x: -18, y: -6 },
          { x: -6, y: -6 },
          { x: -6, y: 6 },
          { x: -18, y: 6 },
        ],
      },
      inner_rings: [
        {
          vertices: [
            { x: -15, y: 0, bulge: 1 },
            { x: -9, y: 0, bulge: 1 },
          ],
        },
      ],
    },
  },
  {
    type: "pcb_silkscreen_graphic",
    pcb_silkscreen_graphic_id: "bottom-graphic",
    pcb_component_id: "component",
    layer: "bottom",
    shape: "brep",
    brep_shape: {
      outer_ring: {
        vertices: [
          { x: 6, y: 0, bulge: 1 },
          { x: 18, y: 0, bulge: 1 },
        ],
      },
      inner_rings: [
        {
          vertices: [
            { x: 9, y: -1 },
            { x: 11, y: -1 },
            { x: 11, y: 1 },
            { x: 9, y: 1 },
          ],
        },
        {
          vertices: [
            { x: 13, y: -1 },
            { x: 15, y: -1 },
            { x: 15, y: 1 },
            { x: 13, y: 1 },
          ],
        },
      ],
    },
  },
] satisfies CircuitJson

// Keepouts precede copper deliberately: their markings must still be visible.
export const keepouts = [
  board,
  {
    type: "pcb_keepout",
    pcb_keepout_id: "mounting-keepout",
    shape: "circle",
    center: { x: -10, y: 0 },
    radius: 6,
    layers: ["top", "inner1", "bottom"],
  },
  {
    type: "pcb_keepout",
    pcb_keepout_id: "rotated-keepout",
    shape: "rect",
    center: { x: 10, y: 0 },
    width: 10,
    height: 8,
    rotation: 30,
    layers: ["top", "inner1", "bottom"],
  },
  ...["top", "inner1", "bottom"].map((layer) => ({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: `keepout-pour-${layer}`,
    layer,
    shape: "rect",
    center: { x: 0, y: 0 },
    width: 44,
    height: 30,
    // Match a mounting-hole copper clearance while leaving copper under the rect.
    brep_shape: {
      outer_ring: {
        vertices: [
          { x: -22, y: -15 },
          { x: 22, y: -15 },
          { x: 22, y: 15 },
          { x: -22, y: 15 },
        ],
      },
      inner_rings: [
        {
          vertices: Array.from({ length: 96 }, (_, i) => ({
            x: -10 + 6 * Math.cos((i * Math.PI) / 48),
            y: 6 * Math.sin((i * Math.PI) / 48),
          })),
        },
      ],
    },
  })),
  {
    type: "pcb_hole",
    pcb_hole_id: "mounting-hole",
    hole_shape: "circle",
    x: -10,
    y: 0,
    hole_diameter: 3,
  },
] as CircuitJson

export const fixtures: Record<string, Fixture> = {
  "via-tenting-top-mask-true": {
    elements: viaTenting,
    options: {
      selectedLayer: "top",
      showSolderMask: true,
      hiddenLayerOpacity: 0,
      transform: { a: 9, b: 0, c: 0, d: -9, e: 400, f: 300 },
    },
  },
  "via-tenting-top-mask-false": {
    elements: viaTenting,
    options: {
      selectedLayer: "top",
      showSolderMask: false,
      hiddenLayerOpacity: 0,
      transform: { a: 9, b: 0, c: 0, d: -9, e: 400, f: 300 },
    },
  },
  "via-tenting-bottom-mask-true": {
    elements: viaTenting,
    options: {
      selectedLayer: "bottom",
      showSolderMask: true,
      hiddenLayerOpacity: 0,
      transform: { a: 9, b: 0, c: 0, d: -9, e: 400, f: 300 },
    },
  },
  "via-tenting-bottom-mask-false": {
    elements: viaTenting,
    options: {
      selectedLayer: "bottom",
      showSolderMask: false,
      hiddenLayerOpacity: 0,
      transform: { a: 9, b: 0, c: 0, d: -9, e: 400, f: 300 },
    },
  },

  "keepouts-top": {
    elements: keepouts,
    options: { selectedLayer: "top", hiddenLayerOpacity: 0 },
  },
  "keepouts-inner": {
    elements: keepouts,
    options: { selectedLayer: "inner1", hiddenLayerOpacity: 0 },
  },
  "keepouts-bottom": {
    elements: keepouts,
    options: { selectedLayer: "bottom", hiddenLayerOpacity: 0 },
  },
  "silkscreen-graphics": {
    elements: [board, ...silkscreenGraphics] as CircuitJson,
    options: { selectedLayer: "top", hiddenLayerOpacity: 1 },
  },
  teardrops: {
    elements: teardropDemo,
    options: {
      hiddenLayerOpacity: 1,
      showCopperPours: false,
      transform: { a: 28, b: 0, c: 0, d: -28, e: 400, f: 300 },
    },
  },
  "board-material-off": { elements: [board] as CircuitJson },
  "board-material-on": {
    elements: [board] as CircuitJson,
    options: { showBoardMaterial: true },
  },
  "pads-and-rotations": { elements: rectPads as CircuitJson },
  "drills-slots-offsets": { elements: holes as CircuitJson },
  "multilayer-routing": { elements: routing as CircuitJson },
  "bottom-layer-selected": {
    elements: routing as CircuitJson,
    options: { selectedLayer: "bottom", hiddenLayerOpacity: 0.15 },
  },
  "hidden-layers": {
    elements: routing as CircuitJson,
    options: { selectedLayer: "inner1", hiddenLayerOpacity: 0 },
  },
  "highlighted-net": {
    elements: routing as CircuitJson,
    options: { highlightedElementIds: ["top-route", "via"] },
  },
  "pour-holes-and-arcs": { elements: pours as CircuitJson },
  "pours-hidden": {
    elements: pours as CircuitJson,
    options: { showCopperPours: false },
  },
  "vector-text": { elements: texts as CircuitJson },
  "soldermask-openings": {
    elements: [...rectPads, ...holes.slice(1)] as CircuitJson,
    options: { showSolderMask: true },
  },
  annotations: {
    elements: annotations as CircuitJson,
    options: { showCourtyards: true, showFabricationNotes: true },
  },
  "board-outline-cutout": {
    elements: [
      {
        ...board,
        outline: [
          { x: -23, y: -15 },
          { x: 23, y: -15 },
          { x: 23, y: 6 },
          { x: 10, y: 16 },
          { x: -23, y: 16 },
        ],
      },
      {
        type: "pcb_cutout",
        pcb_cutout_id: "cut",
        shape: "rect",
        center: { x: 0, y: 0 },
        width: 12,
        height: 8,
      },
    ] as CircuitJson,
  },
}
