export {}
// Run this script, then `bun run dev` and open /tests/repro/f1c100s.html.
// Add ?baseline to compare the original renderer in the same Chrome profile.
const baseline = Bun.spawnSync([
  "git",
  "show",
  "6c1414c7464a743190747c99bb8ec504f2ecf646:dist/index.js",
])
if (baseline.exitCode !== 0) throw new Error(baseline.stderr.toString())
const response = await fetch(
  "https://api.tscircuit.com/package_files/get?package_file_id=66419dfb-e492-484a-b245-889221730e6f",
)
if (!response.ok) throw new Error(`Board download failed: ${response.status}`)
const result = await response.json()
const content = result.package_file.content_text
if (!Array.isArray(JSON.parse(content))) throw new Error("Invalid Circuit JSON")
await Bun.write(".vite/f1c100s-baseline.js", baseline.stdout)
await Bun.write(".vite/f1c100s.circuit.json", content)
console.log(
  "Open /tests/repro/f1c100s.html (patched) or add ?baseline (original).",
)
