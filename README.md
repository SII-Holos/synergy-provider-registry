# Synergy Provider Registry

Unmodified [models.dev](https://models.dev) mirror for [Synergy](https://github.com/SII-Holos/synergy), distributed via GitHub raw CDN.

This repo serves one artifact:

- **`models.json`** — an unmodified snapshot of `https://models.dev/api.json`, refreshed every 6 hours by the `sync-models` workflow and used as a fallback source when models.dev is unreachable from a client's network. Synergy resolves provider and model metadata from data built into the client; this mirror only keeps that data current when the upstream changes.

## Files

- `models.json` — models.dev mirror, refreshed by the `sync-models` workflow (do not hand-edit).
- `scripts/validate-candidate.mjs` — validates a candidate snapshot against Synergy's required provider/model structure before publication.

## How clients consume it

```
https://raw.githubusercontent.com/SII-Holos/synergy-provider-registry/main/models.json
```

`models.json` is a transparent, unmodified models.dev copy; clients validate it against their own schema.

## Sync

The `sync-models` workflow refreshes `models.json` every 6 hours: it downloads `https://models.dev/api.json`, runs `validate-candidate.mjs` against the candidate, and commits it only when the snapshot changed. Structural validation is the only gate — the mirror must keep tracking upstream model additions and removals without being blocked by reference consistency.

Do not hand-edit `models.json` — it is CI-generated.

## Validation

Run the checks locally without installing npm dependencies:

```bash
node --test test/registry.test.mjs
node scripts/validate-candidate.mjs models.json
```

Pull requests that change workflows, scripts, `models.json`, tests, or this README run the same checks in the read-only `Validate registry` workflow.
