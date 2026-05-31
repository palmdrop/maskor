# Review: Import-sequence (active flag + origin + source archival)

**Date**: 2026-05-31
**Scope**: `packages/shared`, `packages/storage`, `packages/sequencer`, `packages/api`, `packages/frontend`
**Plan**: `references/plans/import-sequence.md`
**Spec**: `specifications/import-pipeline.md`, `specifications/sequencer.md`, `specifications/overview.md`

> **Update 2026-05-31 (post-`0cbeab6`)**: Re-reviewed after commit `0cbeab6`, then fixed the open issues. `0cbeab6` fixed a real bug this review originally missed (#0). Design finding #1 (createSequence route dropping `active`/`origin`) and the verify-typecheck gap (#9) are now both resolved — see those entries. All findings remaining are minor/non-blocking.

---

## Overall

Solid, well-tested implementation that matches the plan and the two ADRs. The data model (`active` + `origin`) round-trips cleanly through schema → mapper → DB → indexer; constraint gating is applied at the single call site (`buildBundledResponse`) leaving the sequencer pure; archival and import-sequence creation are correctly gated on a non-empty import; the re-import warning is non-blocking as specified. Specs and glossary were updated in step with the code, not just the `Shipped` logs. One correctness bug (response schema omitted `active`/`origin`, breaking the frontend typecheck) shipped briefly and was fixed in `0cbeab6`; the create-route contract gap (#1) and the verify-typecheck gap (#9) are now fixed. Remaining findings are all minor.

---

## Bugs

### 0. Response schema omitted `active`/`origin` — broke frontend typecheck _(RESOLVED in `0cbeab6`)_

`packages/api/src/schemas/sequence.ts` — the API-layer `SequenceSchema` / `SequenceSummarySchema` (the OpenAPI _response_ shape, distinct from the domain schema) were never given `active`/`origin`. The regenerated frontend `Sequence` type therefore lacked both fields, while `SequenceSidebar.tsx` and `FragmentImportPage.tsx` read `seq.active` / `seq.origin` — so `tsc -b` failed in `packages/frontend`. This shipped uncaught because, **on `main`**, `bun run verify`'s `typecheck` was `tsc --noEmit`, which checks zero frontend files (the frontend root `tsconfig.json` has `"files": []` + references — see `packages/frontend/CLAUDE.md`). Fixed in `0cbeab6` by adding the fields to both response schemas and regenerating the snapshot + client.

This review missed it for the same reason `verify` did: I checked `openapi.json`'s `SequenceCreate` (request) but not the response `Sequence` type, and did not run the frontend typecheck. The underlying toolchain gap is now closed — see #9.

---

## Design

### 1. `createSequence` route ignored `active`/`origin` it advertises _(RESOLVED)_

`packages/api/src/routes/sequences.ts` — the handler destructured only `{ name, isMain }` and forwarded only those to `createSequenceCommand`, but `SequenceCreateSchema` (via the domain schema) exposes `active` (default `true`) and `origin` in the request body — confirmed present in `openapi.json` `SequenceCreate`. A client POSTing `active: false` or an `origin` had them silently discarded, and the `active`/`origin` parameters on `createSequenceCommand` (`create-sequence.ts:14`) were consequently dead (the import path builds the `Sequence` directly via `storageService.sequences.write`, not through the command).

Fixed: the handler now reads `{ name, isMain, active, origin }` and passes `active`/`origin` through to the command — the request schema, command, and behavior now agree. No OpenAPI change was needed (the fields were already in the request schema). Added a route test asserting `active: false` is honored on create (`sequences.test.ts`).

---

## Minor

### 2. Brace-less single-line `if` bodies _(RESOLVED)_

`packages/api/src/commands/fragments/import.ts` — the two brace-less returns in `deriveUniqueSequenceName` / `archiveExtension` violated `CODING_STANDARDS.md` → "Explicit braces on all `if` bodies". Fixed: both now use explicit blocks.

### 3. `> 0` length check instead of truthiness _(RESOLVED)_

`packages/api/src/commands/fragments/import.ts` — `if (created.length > 0)` against "Prefer `!!` / `!` over `> 0` / `=== 0`". Fixed: now `if (created.length)`.

### 4. Nested ternary + brace-less `while` _(RESOLVED)_

`packages/api/src/commands/fragments/import.ts` — the nested ternary in `archiveExtension` is now an `EXTENSION_BY_FORMAT` lookup map; the brace-less `while` in `deriveUniqueSequenceName` now has an explicit block.

### 5. Re-import warning picked an arbitrary prior import _(RESOLVED)_

`packages/api/src/commands/fragments/preview-import.ts` — the match was `find()` (first in `readAll` order). Fixed: now filters matches and sorts by `importedAt` descending, citing the most recent prior import. Added a deterministic test (two import-sequences with controlled timestamps → the newer one is cited).

### 6. Orphaned archive if sequence write fails _(documented)_

`packages/api/src/commands/fragments/import.ts` — the archive bytes are written before `writeImportSequence`; if the sequence write throws, the archived bytes are orphaned under `.maskor/imports/`. Per the original recommendation, left a `// TODO:` noting the cleanup should happen once `storageService.imports` exposes a delete. Narrow edge (disk error / missed name collision), not worth the complexity now.

### 7. Archive test asserts existence, not byte fidelity _(RESOLVED)_

`packages/api/src/__tests__/commands/import.test.ts` — added `expect(await archived.text()).toBe(markdownContent)` so the test actually guards the ADR-0005 byte-for-byte invariant, not just existence.

### 8. Migration file missing trailing newline _(RESOLVED)_

`packages/storage/src/db/vault/migrations/20260531_add_sequence_active_and_origin.sql` — trailing newline added.

### 9. `bun run verify` did not typecheck the frontend _(RESOLVED on this branch)_

Surfaced by #0: on `main`, the root `typecheck` script was `tsc --noEmit`, which checks zero frontend files (the frontend root `tsconfig.json` is `"files": []` + references), and vitest transpiles without type errors — so a frontend `tsc -b` break was invisible to `verify`. This branch's `package.json` changes the script to `tsc --noEmit && bun run --cwd packages/frontend typecheck`, so `verify` now runs the frontend's `tsc -b`. Verified empirically: a deliberate frontend type error now fails `bun run typecheck` (and therefore `verify`). The `0cbeab6` commit message stating verify "does not typecheck packages/frontend" is stale relative to this change.

---

## Non-issues

- **Import-sequence is a plain `Sequence` (no discriminator)** — intentional per ADR-0004; the `origin` presence + `active: false` is how it's distinguished.
- **`active` defaults to `true` in both the mapper (`sequence.ts:11`) and the DB column** — deliberate legacy-safety so pre-existing sequence files keep constraining as before.
- **Binary (`.docx`) written into the vault under `.maskor/imports/`** — intentional per ADR-0005; the watcher ignores `.maskor/`, so it's never adopted as a fragment and the all-markdown entity-folder convention holds.
- **`importSequenceUuid` left as `undefined` in the result object on empty import** — fine; `JSON.stringify` drops it and the schema marks it optional. Conditionally spreading it onto the action-log payload (`import.ts:184/191`) keeps the single-entry payload clean.
- **`active` left `true` on the main sequence** — irrelevant; `buildBundledResponse` only ever filters non-main sequences.
- **Constraint gating applied at the call site, not inside the sequencer** — confirmed `buildBundledResponse` is the only external caller of `computeViolations`/`detectCycles`; keeping the filter there preserves the sequencer's purity.
