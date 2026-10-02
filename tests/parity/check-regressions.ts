import { readFileSync, appendFileSync } from "node:fs"
import type { ComparisonResult, ReferenceTest } from "./types"

export type ParityReport = {
  upstreamCommit: string
  snapshots: { pass: boolean }[]
  snapshotFailed: number
  capturedRenderCalls: number
  renderCalls: number
  parityFailed: number
  referenceFailed: number
  results: ComparisonResult[]
  referenceTests: ReferenceTest[]
}

const indexCases = (results: ComparisonResult[]) => {
  const counts: Record<string, number> = {}
  const indexedResults: Record<string, ComparisonResult> = {}
  for (const result of results) {
    const test = JSON.stringify([result.path, result.test])
    const ordinal = counts[test] ?? 0
    counts[test] = ordinal + 1
    indexedResults[JSON.stringify([test, ordinal])] = result
  }
  return indexedResults
}

const hasNewDiagnostics = (params: {
  before: ComparisonResult
  result: ComparisonResult
}): boolean => {
  const previousDiagnostics = new Set(
    (params.before.diagnostics ?? []).map((diagnostic) =>
      JSON.stringify(diagnostic),
    ),
  )
  return (params.result.diagnostics ?? []).some(
    (diagnostic) => !previousDiagnostics.has(JSON.stringify(diagnostic)),
  )
}

/** The strict SVG audit remains available; CI rejects regressions from its base. */
export function findParityRegressions(
  base: ParityReport,
  head: ParityReport,
): string[] {
  const failures: string[] = []
  for (const [label, report] of [
    ["base", base],
    ["head", head],
  ] as const) {
    if (
      !report.results.length ||
      report.results.length !== report.capturedRenderCalls ||
      report.results.filter((r) => r.status !== "not-comparable").length !==
        report.renderCalls ||
      !report.referenceTests.length
    )
      failures.push(`${label}: incomplete audit`)
  }
  if (base.upstreamCommit !== head.upstreamCommit)
    failures.push(
      "Reference dependency changed; compare against an audit of the same upstream revision",
    )
  if (
    head.snapshotFailed ||
    head.snapshots.some((s) => !s.pass) ||
    head.snapshots.length !== head.renderCalls
  )
    failures.push("Feature snapshots failed or are missing")
  const previous = indexCases(base.results),
    current = indexCases(head.results)
  for (const key of Object.keys(previous))
    if (!(key in current)) failures.push(`Missing comparison: ${key}`)
  for (const [key, result] of Object.entries(current)) {
    const before = previous[key]
    const label = `${result.path}: ${result.test} (${result.id})`
    if (result.status === "error") {
      failures.push(`Render error: ${label}`)
      continue
    }
    if (result.status === "not-comparable") {
      if (
        !before ||
        before.status !== result.status ||
        before.reason !== result.reason
      )
        failures.push(`Comparison was skipped: ${label}`)
      continue
    }
    if (
      !["pass", "mismatch"].includes(result.status) ||
      !Number.isFinite(result.changedPixels)
    ) {
      failures.push(`Invalid result: ${label}`)
      continue
    }
    if (result.status === "pass") continue
    if (
      !before ||
      before.status !== "mismatch" ||
      result.changedPixels! > (before.changedPixels ?? -1) ||
      hasNewDiagnostics({ before, result })
    )
      failures.push(`New or worsened mismatch: ${label}`)
  }
  const reference = new Map(
    base.referenceTests.map((t) => [JSON.stringify([t.path, t.name]), t]),
  )
  const currentReference = new Map(
    head.referenceTests.map((t) => [JSON.stringify([t.path, t.name]), t]),
  )
  for (const key of reference.keys())
    if (!currentReference.has(key))
      failures.push(`Missing reference test: ${key}`)
  for (const [key, test] of currentReference) {
    if (test.status !== "passed" && reference.get(key)?.status !== test.status)
      failures.push(`New reference test failure: ${key}`)
  }
  return failures
}

if (import.meta.main) {
  const [basePath, headPath] = process.argv.slice(2)
  if (!basePath || !headPath)
    throw new Error(
      "Usage: check-regressions.ts base-report.json head-report.json",
    )
  const base = JSON.parse(readFileSync(basePath, "utf8")) as ParityReport
  const head = JSON.parse(readFileSync(headPath, "utf8")) as ParityReport
  const failures = findParityRegressions(base, head)
  const summary = `SVG parity regression check: ${failures.length} regressions across ${head.renderCalls} comparisons.\nStrict audit still reports ${head.parityFailed} SVG mismatches and ${head.referenceFailed} reference failures (base: ${base.parityFailed} and ${base.referenceFailed}).\n`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  if (failures.length) throw new Error(failures.join("\n"))
}
