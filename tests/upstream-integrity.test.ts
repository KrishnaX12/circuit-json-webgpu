import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { createRequire } from "node:module"
import "./parity/prepare-upstream.ts"
import manifest from "./parity/upstream-manifest.json"
test("every upstream test, fixture, snapshot, and reference source matches the installed pinned dependency byte-for-byte", () => {
  expect(
    Object.keys(manifest.files).filter((p) => p.endsWith(".test.ts")),
  ).toHaveLength(116)
  for (const [path, hash] of Object.entries(manifest.files))
    expect(
      createHash("sha256")
        .update(
          readFileSync(
            resolve(import.meta.dir, "upstream/circuit-to-canvas", path),
          ),
        )
        .digest("hex"),
      path,
    ).toBe(hash)
})

test("the frozen Canvas reference resolves its original schema separately from the renderer", () => {
  const rendererRequire = createRequire(import.meta.url)
  const referenceRequire = createRequire(
    resolve(import.meta.dir, "upstream/circuit-to-canvas/package.json"),
  )
  expect(referenceRequire.resolve("circuit-json/package.json")).toBe(
    rendererRequire.resolve("circuit-json-reference/package.json"),
  )
  expect(referenceRequire.resolve("circuit-json/package.json")).not.toBe(
    rendererRequire.resolve("circuit-json/package.json"),
  )
})
