// Validates a provider catalog against a models.dev snapshot.
//
// Usage: node scripts/validate.mjs [catalog-path] [models-path]
//
// Checks:
//   1. catalog shape — version 1, every provider has id+name, only known keys.
//   2. modelsDevProviderID targets exist in the models snapshot (or catalog).
//   3. recommendation.defaultModel and fallbackModels resolve in the mapped
//      models provider so clients never receive unresolved model IDs.
//
// Exits non-zero on any violation so CI blocks publishing broken artifacts.

import { readFileSync } from "node:fs"

const [catalogPath = "catalog.v1.json", modelsPath = "models.json"] = process.argv.slice(2)
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"))
const models = JSON.parse(readFileSync(modelsPath, "utf8"))

const KNOWN_KEYS = new Set([
  "id", "name", "api", "env", "npm", "description", "signupUrl",
  "recommendation", "modelsDevProviderID", "authStrategy", "runtimeStrategy",
  "usageStrategy", "fallbackModels", "models",
])

// Providers Synergy synthesizes at runtime (not present in the models.dev
// mirror). Their modelsDevProviderID legitimately points at an entry that only
// exists client-side, so skip the models.json existence/fallback checks.
const SYNTHETIC_PROVIDERS = new Set(["openai-codex"])

let failures = 0
const fail = (msg) => {
  console.error("FAIL:", msg)
  failures++
}

if (catalog.version !== 1) fail(`version must be 1, got ${catalog.version}`)
if (!catalog.providers || typeof catalog.providers !== "object") fail("missing providers map")

for (const [pid, p] of Object.entries(catalog.providers ?? {})) {
  if (typeof p.id !== "string") fail(`${pid}: missing id`)
  if (typeof p.name !== "string") fail(`${pid}: missing name`)
  for (const key of Object.keys(p)) {
    if (!KNOWN_KEYS.has(key)) fail(`${pid}: unexpected key "${key}"`)
  }

  const sourceID = p.modelsDevProviderID ?? pid
  const source = models[sourceID]
  if (!source) {
    if (SYNTHETIC_PROVIDERS.has(pid) || SYNTHETIC_PROVIDERS.has(sourceID)) continue
    fail(`${pid}: modelsDevProviderID "${sourceID}" not found in models.json`)
    continue
  }

  const defaultModel = p.recommendation?.defaultModel
  if (defaultModel && !source.models?.[defaultModel]) {
    fail(`${pid}: defaultModel "${defaultModel}" not in models provider "${sourceID}"`)
  }
  for (const modelID of p.fallbackModels ?? []) {
    if (!source.models?.[modelID]) {
      fail(`${pid}: fallbackModel "${modelID}" not in models provider "${sourceID}"`)
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} consistency violation(s)`)
  process.exit(1)
}
console.log(`catalog consistent with ${modelsPath} (${Object.keys(catalog.providers).length} providers)`)
