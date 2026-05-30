# Review: Offline OpenAPI codegen for the frontend

**Date**: 2026-05-30
**Scope**: `packages/api`, `packages/frontend`, root scripts
**Plan**: `references/plans/offline-openapi-codegen.md`

---

## Overall

Solid implementation that fully matches the plan. `bun run codegen` now regenerates the orval client from a committed `openapi.json` snapshot with no API server running, and `verify:openapi` guards against drift. The verify guard passes, the new generator test passes (live `/doc` byte-identical to generated output, storage service never touched), and the snapshot commits cleanly. The shared `OPENAPI_DOCUMENT_CONFIG` constant removes the app.ts/generator duplication that would otherwise drift, and the 3.1.0-label-on-V3 quirk is documented at the source (`openapi-config.ts`) rather than silently changed. The two minor items found in review (temp-file cleanup, Windows-fragile path) have since been fixed (items 1–2).

---

## Bugs

None.

---

## Design

None.

---

## Minor

### 1. `verify:openapi` left its temp file behind and used a fixed path — FIXED

`packages/api/package.json:13` previously wrote to a hardcoded `/tmp/maskor-openapi-check.json`, never removed it, and would have raced across concurrent runs. Phase 3 of the plan required cleaning up the temp file.

Resolved by replacing the temp-file + `git diff --no-index` approach with an in-process string comparison: `src/scripts/verify-openapi.ts` renders the snapshot via the new pure `renderOpenAPISnapshot()` export and compares it directly against the committed file. No temp file, no race, no git dependency. `generate-openapi.ts` now guards its write behind `import.meta.main` so the verify guard can import it without filesystem side effects.

### 2. `DEFAULT_OUTPUT_PATH` resolved via `URL(...).pathname` — FIXED

`packages/api/src/scripts/generate-openapi.ts:18` used `new URL(...).pathname`, which yields a broken path on Windows. Replaced with `fileURLToPath` (now `SNAPSHOT_PATH`).

---

## Non-issues

- **`.prettierignore` entry for `openapi.json`** — not a planned task, but a correct and necessary addition. The generator writes `JSON.stringify(document, null, 2)` + `\n`; without the ignore, prettier would reformat the file and break the byte-for-byte verify guard. The plan's assumption that the snapshot "commits cleanly" did not account for formatters touching it.
- **`createApp({} as StorageService)` bare cast** — intentional and safe per the plan. Spec generation only walks route definitions; handlers never run, so the storage service is never dereferenced. The generator test asserts this invariant.
- **`getOpenAPIDocument` (V3) with `openapi: "3.1.0"` label** — deliberately mirrors the existing live `/doc` quirk to keep orval output byte-identical. Documented in `openapi-config.ts`; switching to `getOpenAPI31Document` is a separate decision, correctly out of scope here.
- **`SuggestionModePage` null-check (`fragment?.uuid`, commit `afe0666`)** — rode along on this branch but is its own well-scoped fix, not codegen scope. The suggestion route returns `fragment: null` when no suggestion exists; the orval type `Fragment & (unknown | null)` collapses to `Fragment` so TS does not force the `?.`, but the runtime guard is correct against a real crash.
