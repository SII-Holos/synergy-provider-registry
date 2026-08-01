import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const [modelsPath, catalogPath = "catalog.v1.json"] = process.argv.slice(2)
if (!modelsPath) {
  console.error("usage: node scripts/validate-candidate.mjs <models-path> [catalog-path]")
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
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string")
const REQUIRED_PROVIDERS = ["openai", "anthropic", "google"]

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
    !isStringArray(provider.env) ||
    !isRecord(provider.models)
  ) {
    fail(`${providerID}: invalid provider shape`)
    continue
  }

  for (const [modelID, model] of Object.entries(provider.models)) {
    const limit = isRecord(model) ? model.limit : undefined
    if (
      !isRecord(model) ||
      typeof model.id !== "string" ||
      typeof model.name !== "string" ||
      typeof model.release_date !== "string" ||
      typeof model.attachment !== "boolean" ||
      typeof model.reasoning !== "boolean" ||
      typeof model.tool_call !== "boolean" ||
      !isRecord(limit) ||
      typeof limit.context !== "number" ||
      typeof limit.output !== "number" ||
      (limit.input !== undefined && typeof limit.input !== "number")
    ) {
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

const validatePath = join(dirname(fileURLToPath(import.meta.url)), "validate.mjs")
const validation = spawnSync(process.execPath, [validatePath, catalogPath, modelsPath], {
  encoding: "utf8",
})
process.stdout.write(validation.stdout ?? "")
process.stderr.write(validation.stderr ?? validation.error?.message ?? "")
process.exitCode = validation.status ?? 1
