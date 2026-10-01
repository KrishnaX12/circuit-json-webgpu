import type { CircuitJson, PcbVia } from "circuit-json"

export const viaTenting: CircuitJson = [
  {
    type: "pcb_board",
    pcb_board_id: "board",
    width: 80,
    height: 48,
    center: { x: 0, y: 0 },
    thickness: 1.6,
    num_layers: 2,
    material: "fr4",
    default_via_tented_on_top: true,
    default_via_tented_on_bottom: false,
  },
]

for (const [column, flags] of [
  { tented_on_top: undefined, tented_on_bottom: undefined },
  { tented_on_top: false, tented_on_bottom: false },
  { tented_on_top: true, tented_on_bottom: false },
  { tented_on_top: true, tented_on_bottom: true },
].entries()) {
  const x = -27 + column * 18
  const via: PcbVia = {
    type: "pcb_via",
    pcb_via_id: `via_${column}`,
    x,
    y: 7,
    hole_diameter: 2,
    outer_diameter: 4,
    layers: ["top", "bottom"],
    ...flags,
  }
  viaTenting.push(via, {
    type: "pcb_trace",
    pcb_trace_id: `trace_${column}`,
    route: [
      { route_type: "wire", x: x - 5, y: -10, layer: "top", width: 0.8 },
      {
        route_type: "via",
        x,
        y: -10,
        from_layer: "top",
        to_layer: "bottom",
        hole_diameter: 2,
        outer_diameter: 4,
        ...flags,
      },
      { route_type: "wire", x: x + 5, y: -10, layer: "bottom", width: 0.8 },
    ],
  })
  if (column < 2) {
    viaTenting.push({
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: `overlap_${column}`,
      pcb_component_id: "component",
      text: "GND",
      anchor_position: { x, y: 7 },
      anchor_alignment: "center",
      font: "tscircuit2024",
      font_size: 1.6,
      layer: "top",
    })
  }
  for (const side of ["top", "bottom"] as const) {
    for (const [row, text] of [
      `tented_on_top: ${flags.tented_on_top ?? "unset"}`,
      `tented_on_bottom: ${flags.tented_on_bottom ?? "unset"}`,
    ].entries()) {
      viaTenting.push({
        type: "pcb_note_text",
        pcb_note_text_id: `label_${side}_${column}_${row}`,
        text,
        anchor_position: { x, y: 17 - row * 2 },
        anchor_alignment: "center",
        font: "tscircuit2024",
        font_size: 1,
        is_mirrored_from_top_view: false,
        layer: side,
      })
    }
    for (const [y, text] of [
      [2, "pcb_via"],
      [-15, "pcb_trace.route via"],
    ] as const) {
      viaTenting.push({
        type: "pcb_note_text",
        pcb_note_text_id: `row_${side}_${column}_${y}`,
        text,
        anchor_position: { x, y },
        anchor_alignment: "center",
        font: "tscircuit2024",
        font_size: 1.2,
        is_mirrored_from_top_view: false,
        layer: side,
      })
    }
  }
}
