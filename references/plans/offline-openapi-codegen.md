# Offline OpenAPI codegen for the frontend

**Date**: 30-05-2026
**Status**: Done
**Specs**: `references/plans/openapi-swagger.md` (origin of the OpenAPI surface; not a `specifications/` doc)
**Closed**: 30-05-2026

---

## Goal

`bun run codegen` in `packages/frontend` regenerates the orval client from a committed `openapi.json` snapshot, with no API server running — and a verify guard fails CI / `bun run verify` if that snapshot drifts from the route definitions.

---

## Background / findings

- `orval.config.ts:9` points `input` at `http://localhost:3001/doc`. Codegen therefore needs a live server bound to that port. This is the entire problem.
- `packages/api/src/app.ts` `createApp()` returns the `OpenAPIHono` instance. The spec is produced by walking registered `createRoute` definitions — handlers never run, so `storageService` is never touched during generation.
- `createApp` calls `createSettingsService` (pure closures, no side effects). The side-effecting `createStorageService` (opens the registry SQLite) is injected by `index.ts`, **not** called inside `createApp`. So `createApp({} as StorageService)` touches no filesystem and is safe for a build-time script.
- `app.doc()` internally calls `getOpenAPIDocument` (`OpenApiGeneratorV3`) even though the config says `openapi: "3.1.0"` — it stamps the version string onto a 3.0-structured document. The static generator must mirror this (call `getOpenAPIDocument`, **not** `getOpenAPI31Document`) to stay byte-identical to today's live `/doc`. See "Surprises to flag".
- The generator must run under **bun** (transitive `bun:sqlite` etc.), not node.
- `packages/frontend/src/api/generated/` is already gitignored (root `.gitignore` `generated` pattern) — the orval client is never committed, so every checkout/CI already must run codegen. Making codegen serverless removes the only friction in that existing step.
- `packages/frontend/src/api/openapi.json` is **not** matched by any gitignore rule — it commits cleanly. The snapshot must live at `src/api/` (a sibling of `generated/`), never inside a `generated/` dir or it would be ignored.

Established-solution research (web): a standalone script calling `getOpenAPIDocument()` and writing JSON is the documented convention for `@hono/zod-openapi`; orval consuming a static file is its normal mode (the live-URL input is the unusual choice). No turnkey tool to adopt.

---

## Decisions (locked with developer)

- **Ownership**: the API package owns and commits the snapshot (it owns the spec). The verify guard lives in the API package. Frontend `codegen` only runs orval against the committed file — kept dependency-free and fast.
- **Sync strategy**: codegen _consumes_ the committed snapshot. A verify guard (regenerate to a temp file + `git diff --exit-code` against the committed snapshot) enforces freshness, wired into `bun run verify` / CI.
- **Spec version**: match today's `/doc` output exactly — `getOpenAPIDocument` (V3 generator) with `openapi: "3.1.0"` label. Byte-identical; zero change to generated orval hooks. Do **not** switch to `getOpenAPI31Document` in this work.

---

## Tasks

### Phase 1 — Generator + shared doc config

- [x] Create branch `offline-openapi-codegen` from the plan title.
- [x] Extract the OpenAPI doc config (`openapi: "3.1.0"`, `info: { title: "Maskor API", version: "0.1.0" }`) into a single shared constant in `packages/api/src/` so `app.ts`'s `app.doc()` call and the new generator cannot drift. Point `app.doc()` at it.
- [x] Add `packages/api/src/scripts/generate-openapi.ts`: build the app via `createApp({} as StorageService)`, call `getOpenAPIDocument(<shared config>)`, write `packages/frontend/src/api/openapi.json` (pretty-printed, trailing newline to match prettier).
- [x] Add a `generate-openapi` script to `packages/api/package.json` that runs the generator under bun.
- [x] Generate and commit the initial `packages/frontend/src/api/openapi.json` snapshot.

### Phase 2 — Point orval at the snapshot

- [x] `packages/frontend/orval.config.ts`: change `input` to `"src/api/openapi.json"`; remove the localhost TODO comment (line 3).
- [x] Run `bun run codegen` from `packages/frontend` with **no server running**; confirm the generated client is byte-identical to the pre-change output (the snapshot was produced from the same code path).
- [x] Commit.

### Phase 3 — Verify guard

- [x] Add a verify-guard script to `packages/api/package.json`: regenerate the spec to a temp path, `git diff --exit-code` (or equivalent content compare) against the committed `openapi.json`, fail non-zero on any difference, clean up the temp file. Decide the script name (suggest `verify:openapi`).
- [x] Wire the guard into the repo-level check. The API package currently has no `verify`/`typecheck` script and root `verify` is `tsc --noEmit && test`. Recommended: invoke the API guard from the root `verify` script so `bun run verify` catches drift. Confirm placement with the developer if it complicates ordering.
- [x] Verify the guard fails when a route changes without the snapshot being regenerated, and passes when they match.
- [x] Commit.

### Phase 4 — Docs

Update every durable instruction source that references the codegen pattern so all of them describe the new serverless flow consistently. (Point-in-time records — `references/plans/*`, `references/reviews/*`, `.claude/PROMPT.md` — are **not** updated; they document history.)

- [x] **`.claude/CLAUDE.md` (root, line 11)**: rewrite the codegen instruction. Today it says "run `bun run codegen` in `packages/frontend`. Assume the API is already running, you usually do not have to start it yourself." Replace with: codegen reads a committed snapshot and needs no running API; when you change a route, regenerate the snapshot from `packages/api` first. This line is the primary source of the "is the API running?" agent confusion — it is the highest-priority doc fix.
- [x] **`packages/frontend/CLAUDE.md`**: drop "assume the API is already running / start it with `bun run dev`" from the codegen steps; replace with the serverless flow (snapshot is committed; `bun run codegen` runs orval against `src/api/openapi.json`; regenerate the snapshot from `packages/api` when routes change).
- [x] **`packages/api/CLAUDE.md`**: add a short instruction — the API package owns the committed OpenAPI snapshot; after adding or changing a route, run `bun run generate-openapi` to refresh `packages/frontend/src/api/openapi.json`, and note the verify guard fails if it drifts.
- [x] **`references/suggestions.md`**: tick / remove the "saved OpenAPI snapshot for offline codegen" entry (line 35), noting it shipped as code-generated rather than `curl`-captured.
- [x] Confirm no `specifications/` doc documents the codegen _procedure_ (only `specifications/quick-switcher.md:138` references the orval client, which stays accurate) — no spec edit expected; verify during implementation.
- [x] Flag the `app.doc()` 3.1.0-label-on-V3-document quirk to the developer (see below) — record-only, not fixed here.
- [x] Commit.

---

## Open considerations

- **Verify-guard location/name**: lives in `packages/api/package.json` (suggested `verify:openapi`), invoked from root `verify`. Final name + wiring to confirm at implementation.
- **Shared doc-config constant**: in scope (Phase 1) — removes the duplication between `app.ts` and the generator that would otherwise be a silent drift source.
- **gitignore**: no change needed. Snapshot at `src/api/openapi.json` is not ignored and must be committed; do not relocate it under any `generated/` directory.

---

## Surprises to flag (per project convention)

- `app.doc("/doc", { openapi: "3.1.0", ... })` emits an **OpenAPI 3.0-structured** document (via `OpenApiGeneratorV3`) with the version string overwritten to `"3.1.0"`. The existing `/doc` smoke test only asserts the version string, so it does not catch this. This plan deliberately mirrors the quirk to stay byte-identical; fixing it (switching to `doc31` / `getOpenAPI31Document`) is a separate decision that would change orval output.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- Add a test asserting the generator output equals the committed snapshot (this is effectively the verify guard; a script-level check is acceptable in lieu of a unit test if it runs in `verify`).
- Existing `packages/api/src/__tests__/routes/openapi.test.ts` continues to cover the live `/doc` endpoint; no change expected there.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done` or `In Progress`. There is no `specifications/` doc for this work; update `references/plans/openapi-swagger.md` only if its scope is materially affected.
