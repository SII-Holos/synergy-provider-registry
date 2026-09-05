import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
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
  const required = ["openai", "anthropic", "google", "github-copilot"]
  const models = Object.fromEntries(
    required.map((id) => [id, provider(id, { [`${id}-model`]: model(`${id}-model`) })]),
  )
  for (let index = required.length; index < count; index++) {
    const id = `provider-${index}`
    models[id] = provider(id)
  }
  return { ...models, ...overrides }
}

test("candidate validation rejects invalid JSON", () => {
  const dir = fixture()
  const candidate = join(dir, "models.json.new")
  writeFileSync(candidate, "{ broken")

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /JSON|parse/i)
})

test("candidate validation rejects suspiciously small snapshots", () => {
  const dir = fixture()
  const candidate = writeJson(dir, "models.json.new", modelsWithProviderCount(49))

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /suspiciously few providers: 49/)
})

test("candidate validation rejects malformed providers", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, { "provider-4": { models: {} } }),
  )

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /provider-4/)
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

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

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

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /google/)
  assert.match(result.stderr, /required provider/)
})

test("candidate validation requires non-empty github-copilot", () => {
  const dir = fixture()
  const candidate = writeJson(
    dir,
    "models.json.new",
    modelsWithProviderCount(50, { "github-copilot": provider("github-copilot") }),
  )

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /github-copilot/)
  assert.match(result.stderr, /required provider/)
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

  const result = runNode(VALIDATE_CANDIDATE, [candidate], dir)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /fetched providers: 51/)
})

test("committed models.json passes the candidate validator", () => {
  const result = runNode(VALIDATE_CANDIDATE, ["models.json"])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /fetched providers: \d+/)
})

test("committed models.json is structurally sound", () => {
  const models = JSON.parse(readFileSync(join(ROOT, "models.json"), "utf8"))

  for (const [providerID, provider] of Object.entries(models)) {
    assert.equal(typeof provider.id, "string", `${providerID}: provider id`)
    assert.equal(typeof provider.name, "string", `${providerID}: provider name`)
    assert.equal(typeof provider.models, "object", `${providerID}: provider models`)
    assert.ok(!Array.isArray(provider.models), `${providerID}: provider models object`)
    for (const [modelID, model] of Object.entries(provider.models)) {
      assert.equal(typeof model.id, "string", `${providerID}/${modelID}: model id`)
      assert.equal(typeof model.name, "string", `${providerID}/${modelID}: model name`)
    }
  }

  assert.ok(Object.keys(models["github-copilot"].models).length > 0, "github-copilot models non-empty")
})

test("README describes the mirror-only sync and validation flow", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8")

  assert.doesNotMatch(readme, /catalog/i)
  assert.doesNotMatch(readme, /Ed25519|signature|signing/i)
  assert.match(readme, /every 6 hours/i)
  assert.match(readme, /validate-candidate/i)
  assert.match(readme, /models\.json/i)
})
