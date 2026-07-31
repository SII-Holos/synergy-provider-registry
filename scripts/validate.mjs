// Validates catalog.v1.json against models.json (the models.dev mirror).
//
// Checks:
//   1. catalog shape — version 1, every provider has id+name, only known keys.
//   2. modelsDevProviderID targets exist in models.json (or in the catalog).
//   3. every fallbackModels entry resolves to a model present in the mapped
//      models.json provider — otherwise the client would synthesize a bare
//      fallbackModel with no real metadata.
//
// Exits non-zero on any violation so CI blocks signing a broken catalog.

import { readFileSync } from "node:fs"

const catalog = JSON.parse(readFileSync("catalog.v1.json", "utf8"))
const models = JSON.parse(readFileSync("models.json", "utf8"))

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

  for (const modelID of p.fallbackModels ?? []) {
    if (!source.models?.[modelID]) {
      fail(`${pid}: fallbackModel "${modelID}" not in models.json provider "${sourceID}"`)
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} consistency violation(s)`)
  process.exit(1)
}
console.log(`catalog consistent with models.json (${Object.keys(catalog.providers).length} providers)`)
