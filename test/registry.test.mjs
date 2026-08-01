import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VALIDATE = join(ROOT, "scripts", "validate.mjs")
const VALIDATE_CANDIDATE = join(ROOT, "scripts", "validate-candidate.mjs")

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "provider-registry-"))
  test.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function writeJson(dir, name, value) {
  const path = join(dir, name)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  return path
}

function runNode(script, args = [], cwd = ROOT) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  })
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  }
}

function model(id) {
  return {
    id,
    name: id,
    release_date: "2026-01-01",
    attachment: false,
    reasoning: false,
    tool_call: true,
    limit: { context: 128_000, output: 16_384 },
  }
}

function provider(id, models = {}) {
  return { id, name: id, env: [], models }
}

function modelsWithProviderCount(count, overrides = {}) {
  const required = ["openai", "anthropic", "google"]
  const models = Object.fromEntries(
    required.map((id) => [id, provider(id, { [`${id}-model`]: model(`${id}-model`) })]),
  )
  for (let index = required.length; index < count; index++) {
    const id = `provider-${index}`
    models[id] = provider(id)
  }
  return { ...models, ...overrides }
}

test("validate accepts explicit catalog and models paths", () => {
  const dir = fixture()
  const catalog = writeJson(dir, "custom-catalog.json", {
    version: 1,
    providers: {
      openai: { id: "openai", name: "OpenAI", recommendation: { defaultModel: "gpt-4o" } },
    },
  })
  const models = writeJson(dir, "custom-models.json", {
    openai: { models: { "gpt-4o": {} } },
  })

  const result = runNode(VALIDATE, [catalog, models], dir)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /catalog consistent/)
})

test("validate rejects a missing recommendation defaultModel", () => {
  const dir = fixture()
  const catalog = writeJson(dir, "catalog.json", {
    version: 1,
    providers: {
      vercel: { id: "vercel", name: "Vercel", recommendation: { defaultModel: "gpt-4o" } },
    },
  })
  const models = writeJson(dir, "models.json", {
    vercel: { models: { "openai/gpt-4o": {} } },
  })

  const result = runNode(VALIDATE, [catalog, models], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /vercel/)
  assert.match(result.stderr, /defaultModel/)
  assert.match(result.stderr, /gpt-4o/)
})

test("validate preserves synthetic provider exemptions", () => {
  const dir = fixture()
  const catalog = writeJson(dir, "catalog.json", {
    version: 1,
    providers: {
      "openai-codex": {
        id: "openai-codex",
        name: "OpenAI Codex",
        recommendation: { defaultModel: "gpt-5.4-mini" },
      },
    },
  })
  const models = writeJson(dir, "models.json", {
    openai: { models: {} },
  })

  const result = runNode(VALIDATE, [catalog, models], dir)

  assert.equal(result.status, 0, result.stderr)
})

test("validate keeps rejecting missing fallback models", () => {
  const dir = fixture()
  const catalog = writeJson(dir, "catalog.json", {
    version: 1,
    providers: {
      openai: { id: "openai", name: "OpenAI", fallbackModels: ["missing-model"] },
    },
  })
  const models = writeJson(dir, "models.json", {
    openai: { models: { "gpt-4o": {} } },
  })

  const result = runNode(VALIDATE, [catalog, models], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing-model/)
})

test("candidate validation rejects invalid JSON", () => {
  const dir = fixture()
  const candidate = join(dir, "models.json.new")
  writeFileSync(candidate, "{ broken")
  const catalog = writeJson(dir, "catalog.json", { version: 1, providers: {} })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /JSON|parse/i)
})

test("candidate validation rejects suspiciously small snapshots", () => {
  const dir = fixture()
  const candidate = writeJson(dir, "models.json.new", modelsWithProviderCount(49))
  const catalog = writeJson(dir, "catalog.json", { version: 1, providers: {} })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /suspiciously few providers: 49/)
})

test("candidate validation rejects malformed providers", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, { "provider-3": { models: {} } }),
  )
  const catalog = writeJson(dir, "catalog.json", { version: 1, providers: {} })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /provider-3/)
  assert.match(result.stderr, /invalid provider/)
})

test("candidate validation rejects malformed models", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, {
      openai: provider("openai", { broken: { id: "broken" } }),
    }),
  )
  const catalog = writeJson(dir, "catalog.json", { version: 1, providers: {} })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /openai\/broken/)
  assert.match(result.stderr, /invalid model/)
})

test("candidate validation requires populated core providers", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, { google: provider("google") }),
  )
  const catalog = writeJson(dir, "catalog.json", { version: 1, providers: {} })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /google/)
  assert.match(result.stderr, /required provider/)
})

test("candidate validation rejects catalog inconsistencies", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, { vercel: provider("vercel") }),
  )
  const catalog = writeJson(dir, "catalog.json", {
    version: 1,
    providers: {
      vercel: {
        id: "vercel",
        name: "Vercel",
        recommendation: { defaultModel: "openai/gpt-4o" },
      },
    },
  })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /vercel/)
  assert.match(result.stderr, /openai\/gpt-4o/)
})

test("candidate validation accepts a consistent snapshot", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, {
      vercel: provider("vercel", { "openai/gpt-4o": model("openai/gpt-4o") }),
    }),
  )
  const catalog = writeJson(dir, "catalog.json", {
    version: 1,
    providers: {
      vercel: {
        id: "vercel",
        name: "Vercel",
        recommendation: { defaultModel: "openai/gpt-4o" },
      },
    },
  })

  const result = runNode(VALIDATE_CANDIDATE, [candidate, catalog], dir)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /fetched providers: 51/)
})

test("committed catalog is reproducible and all model references resolve", () => {
  const dir = fixture()
  const generated = join(dir, "catalog.v1.json")
  const build = spawnSync("python3", ["scripts/build-catalog.py", generated], {
    cwd: ROOT,
    encoding: "utf8",
  })
  assert.equal(build.status, 0, build.stderr)

  const committedText = readFileSync(join(ROOT, "catalog.v1.json"), "utf8")
  assert.equal(readFileSync(generated, "utf8"), committedText)

  const catalog = JSON.parse(committedText)
  const models = JSON.parse(readFileSync(join(ROOT, "models.json"), "utf8"))
  assert.equal(catalog.providers.vercel.recommendation.defaultModel, "openai/gpt-4o")

  for (const [providerID, provider] of Object.entries(catalog.providers)) {
    if (providerID === "openai-codex") continue
    const sourceID = provider.modelsDevProviderID ?? providerID
    const source = models[sourceID]
    const defaultModel = provider.recommendation?.defaultModel
    if (defaultModel) {
      assert.ok(source?.models?.[defaultModel], `${providerID}: missing defaultModel ${defaultModel}`)
    }
    for (const modelID of provider.fallbackModels ?? []) {
      assert.ok(source?.models?.[modelID], `${providerID}: missing fallbackModel ${modelID}`)
    }
  }
})

test("README describes the actual sync and validation flow", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8")

  assert.doesNotMatch(readme, /daily/i)
  assert.doesNotMatch(readme, /Because that also triggers the `sign` workflow/)
  assert.match(readme, /every 6 hours/i)
  assert.match(readme, /candidate/i)
})
