# Review: Import-sequence (active flag + origin + source archival)

**Date**: 2026-05-31
**Scope**: `packages/shared`, `packages/storage`, `packages/sequencer`, `packages/api`, `packages/frontend`
**Plan**: `references/plans/import-sequence.md`
**Spec**: `specifications/import-pipeline.md`, `specifications/sequencer.md`, `specifications/overview.md`

---

## Overall

Solid, well-tested implementation that matches the plan and the two ADRs. The data model (`active` + `origin`) round-trips cleanly through schema → mapper → DB → indexer; constraint gating is applied at the single call site (`buildBundledResponse`) leaving the sequencer pure; archival and import-sequence creation are correctly gated on a non-empty import; the re-import warning is non-blocking as specified. Specs and glossary were updated in step with the code, not just the `Shipped` logs. No correctness bugs found. The notable structural gap: the `createSequence` route advertises `active`/`origin` in its OpenAPI body but silently drops them, leaving dead parameters on the command.

---

## Bugs

None.

---

## Design

### 1. `createSequence` route ignores `active`/`origin` it advertises

`packages/api/src/routes/sequences.ts:469` — the handler destructures only `{ name, isMain }` and forwards only those to `createSequenceCommand`, but `SequenceCreateSchema` (via the domain schema) now exposes `active` (default `true`) and `origin` in the request body — confirmed present in the committed `openapi.json` `SequenceCreate`. A client POSTing `active: false` or an `origin` has them silently discarded. Correspondingly, the `active`/`origin` parameters added to `createSequenceCommand` (`create-sequence.ts:14`) are dead — the only caller is this route, and the import path builds the `Sequence` directly via `storageService.sequences.write` rather than through the command.

Consequence: misleading API contract, plus carrying-cost on a command nobody exercises with those args. Either wire the two fields through the route (`const { name, isMain, active, origin } = ctx.req.valid("json")` → pass them on) or drop them from the API create schema and the command until a caller needs them. Wiring them through is the smaller change and keeps the command honest.

---

## Minor

### 2. Brace-less single-line `if` bodies

`packages/api/src/commands/fragments/import.ts:12` (`if (!existingNames.has(base)) return base;`) and `:94` (`if (fromName) return fromName;`) violate `CODING_STANDARDS.md` → "Explicit braces on all `if` bodies". Not lint-enforced (no `curly` rule in `eslint.config.ts`), so `verify` stays green, but it's a documented convention.

### 3. `> 0` length check instead of truthiness

`packages/api/src/commands/fragments/import.ts:154` — `if (created.length > 0)` against the standard "Prefer `!!` / `!` over `> 0` / `=== 0` for length checks". Use `if (created.length)`.

### 4. Nested ternary + brace-less `while`

`packages/api/src/commands/fragments/import.ts:95` returns a nested ternary (`format === "docx" ? ".docx" : format === "plaintext" ? ".txt" : ".md"`); `:14` has a brace-less `while` body (`while (...) suffix++;`). Readable, but a small lookup object or early returns would match the house style better.

### 5. Re-import warning picks an arbitrary prior import

`packages/api/src/commands/fragments/preview-import.ts:35` — `sequences.find((sequence) => sequence.origin?.fileName === input.sourceFileName)` returns the first match in `readAll` order. After two prior imports of the same name, the warning may cite the older sequence/date rather than the most recent. The spec only promises "a non-blocking warning matched on an existing sequence's `origin.fileName`", so this is acceptable, but citing the most recent (max `importedAt`) would be less confusing.

### 6. Orphaned archive if sequence write fails

`packages/api/src/commands/fragments/import.ts:157-174` — the archive bytes are written before `writeImportSequence`. If `sequences.write` throws (disk error, or a name collision the dedup somehow missed), the `.maskor/imports/<uuid>.<ext>` file is left with nothing referencing it (and still swept into Draft snapshots per ADR-0005). Narrow edge; worth a `// TODO:` at most.

### 7. Archive test asserts existence, not byte fidelity

`packages/api/src/__tests__/commands/import.test.ts:288` — the import-sequence test checks the archive file `exists()`, but the whole point of ADR-0005 is *byte-for-byte* preservation. A `Bun.file(...).bytes()` (or `.text()`) equality assertion against the input would actually guard the invariant.

### 8. Migration file missing trailing newline

`packages/storage/src/db/vault/migrations/20260531_add_sequence_active_and_origin.sql` — no newline at EOF. Trivial; `DEFAULT true` is consistent with the existing drizzle-generated `is_main DEFAULT false` convention, so the SQL itself is fine.

---

## Non-issues

- **Import-sequence is a plain `Sequence` (no discriminator)** — intentional per ADR-0004; the `origin` presence + `active: false` is how it's distinguished.
- **`active` defaults to `true` in both the mapper (`sequence.ts:11`) and the DB column** — deliberate legacy-safety so pre-existing sequence files keep constraining as before.
- **Binary (`.docx`) written into the vault under `.maskor/imports/`** — intentional per ADR-0005; the watcher ignores `.maskor/`, so it's never adopted as a fragment and the all-markdown entity-folder convention holds.
- **`importSequenceUuid` left as `undefined` in the result object on empty import** — fine; `JSON.stringify` drops it and the schema marks it optional. Conditionally spreading it onto the action-log payload (`import.ts:184/191`) keeps the single-entry payload clean.
- **`active` left `true` on the main sequence** — irrelevant; `buildBundledResponse` only ever filters non-main sequences.
- **Constraint gating applied at the call site, not inside the sequencer** — confirmed `buildBundledResponse` is the only external caller of `computeViolations`/`detectCycles`; keeping the filter there preserves the sequencer's purity.
