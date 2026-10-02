import { expect, test } from "bun:test"
import {
  findParityRegressions,
  type ParityReport,
} from "./parity/check-regressions"

const report = (): ParityReport => ({
  upstreamCommit: "same-reference",
  snapshots: [{ pass: true }],
  snapshotFailed: 0,
  capturedRenderCalls: 1,
  renderCalls: 1,
  parityFailed: 1,
  referenceFailed: 0,
  results: [
    {
      id: "1",
      path: "fixture.ts",
      test: "pad",
      status: "mismatch",
      changedPixels: 10,
      diagnostics: [],
    },
  ],
  referenceTests: [
    { path: "fixture.ts", name: "pad", status: "passed", caseIds: ["1"] },
  ],
})

test("unchanged known mismatches pass, improvements pass, worsening by one pixel fails", () => {
  const base = report()
  const head = report()
  base.results[0].diagnostics = [
    {
      elementId: "dimension-1",
      type: "pcb_note_dimension",
      message: "Unsupported element type",
    },
  ]
  head.results[0].diagnostics = [...base.results[0].diagnostics]
  expect(findParityRegressions(base, head)).toEqual([])
  head.results[0].changedPixels = 9
  head.results[0].diagnostics = []
  expect(findParityRegressions(base, head)).toEqual([])
  head.results[0].diagnostics = [
    {
      elementId: "dimension-1",
      type: "pcb_note_dimension",
      message: "New diagnostic",
    },
  ]
  expect(findParityRegressions(base, head)).toHaveLength(1)
  head.results[0].changedPixels = 11
  expect(findParityRegressions(base, head)).toHaveLength(1)
})

test("a previously passing case cannot become a mismatch", () => {
  const base = report()
  base.results[0].status = "pass"
  expect(findParityRegressions(base, report())).toHaveLength(1)
})

test("missing comparisons, skipped renders, render errors, and failed snapshots fail", () => {
  for (const status of ["error", "not-comparable"]) {
    const head = report()
    head.results[0].status = status
    expect(findParityRegressions(report(), head).length).toBeGreaterThan(0)
  }
  const missing = report()
  missing.results = []
  expect(findParityRegressions(report(), missing).length).toBeGreaterThan(0)
  const snapshot = report()
  snapshot.snapshots[0].pass = false
  expect(findParityRegressions(report(), snapshot)).toHaveLength(1)
})

test("reference test regressions and changed upstream revisions fail", () => {
  const head = report()
  head.referenceTests[0].status = "failed"
  expect(findParityRegressions(report(), head)).toHaveLength(1)
  head.upstreamCommit = "different-reference"
  expect(findParityRegressions(report(), head)).toHaveLength(2)
})
