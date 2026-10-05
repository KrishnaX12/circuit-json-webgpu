import { appendFileSync, readFileSync } from "node:fs"
import type { Diagnostic } from "../../lib/types"
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

function getDiagnosticKey(diagnostic: Diagnostic): string {
  return JSON.stringify([
    diagnostic.elementId,
    diagnostic.type,
    diagnostic.message,
  ])
}

function currentDiagnosticsAreSubsetOfBase({
  baseDiagnostics,
  currentDiagnostics,
}: {
  baseDiagnostics: Diagnostic[] | undefined
  currentDiagnostics: Diagnostic[] | undefined
}): boolean {
  const unmatchedBaseDiagnosticKeys = (baseDiagnostics ?? []).map(
    getDiagnosticKey,
  )
  for (const diagnostic of currentDiagnostics ?? []) {
    const diagnosticKey = getDiagnosticKey(diagnostic)
    const matchingBaseIndex = unmatchedBaseDiagnosticKeys.indexOf(diagnosticKey)
    if (matchingBaseIndex === -1) return false
    unmatchedBaseDiagnosticKeys.splice(matchingBaseIndex, 1)
  }
  return true
}

const indexCases = (results: ComparisonResult[]) => {
  const counts = new Map<string, number>()
  return new Map(
    results.map((result) => {
      const test = JSON.stringify([result.path, result.test])
      const ordinal = counts.get(test) ?? 0
      counts.set(test, ordinal + 1)
      return [JSON.stringify([test, ordinal]), result]
    }),
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
  const previous = indexCases(base.results)
  const current = indexCases(head.results)
  for (const key of previous.keys())
    if (!current.has(key)) failures.push(`Missing comparison: ${key}`)
  for (const [key, result] of current) {
    const before = previous.get(key)
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
      !currentDiagnosticsAreSubsetOfBase({
        baseDiagnostics: before.diagnostics,
        currentDiagnostics: result.diagnostics,
      })
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
