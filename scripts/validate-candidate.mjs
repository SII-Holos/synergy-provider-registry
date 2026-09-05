// Validates a candidate models.dev snapshot structure before publication.
//
// Usage: node scripts/validate-candidate.mjs <models-path>
//
// Checks:
//   1. the candidate parses as JSON and is an object of provider records
//   2. every provider has string id/name plus a models object; every model
//      has string id/name
//   3. key providers exist with non-empty model sets
//
// Exits non-zero on any violation so CI blocks publishing broken snapshots.

import { readFileSync } from "node:fs"

const [modelsPath] = process.argv.slice(2)
if (!modelsPath) {
  console.error("usage: node scripts/validate-candidate.mjs <models-path>")
  process.exit(1)
}

let models
try {
  models = JSON.parse(readFileSync(modelsPath, "utf8"))
} catch (error) {
  console.error(`invalid JSON candidate ${modelsPath}:`, error.message)
  process.exit(1)
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const REQUIRED_PROVIDERS = ["openai", "anthropic", "google", "github-copilot"]

let failures = 0
const fail = (message) => {
  console.error("FAIL:", message)
  failures++
}

if (!isRecord(models)) {
  console.error(`invalid models catalog in ${modelsPath}: expected an object`)
  process.exit(1)
}

const providerCount = Object.keys(models).length
if (providerCount < 50) {
  console.error(`suspiciously few providers: ${providerCount}`)
  process.exit(1)
}

for (const [providerID, provider] of Object.entries(models)) {
  if (
    !isRecord(provider) ||
    typeof provider.id !== "string" ||
    typeof provider.name !== "string" ||
    !isRecord(provider.models)
  ) {
    fail(`${providerID}: invalid provider shape`)
    continue
  }

  for (const [modelID, model] of Object.entries(provider.models)) {
    if (!isRecord(model) || typeof model.id !== "string" || typeof model.name !== "string") {
      fail(`${providerID}/${modelID}: invalid model shape`)
    }
  }
}

for (const providerID of REQUIRED_PROVIDERS) {
  if (!isRecord(models[providerID]?.models) || Object.keys(models[providerID].models).length === 0) {
    fail(`${providerID}: required provider must contain models`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} candidate schema violation(s)`)
  process.exit(1)
}

console.log(`fetched providers: ${providerCount}`)
