# Glossary alignment — spec and code updates

**Date**: 20-05-2026
**Status**: Done
**Closed**: 20-05-2026
**Specs**: `specifications/_glossary.md`

---

## Goal

Bring all specification files and the codebase into alignment with the decisions recorded in `specifications/_glossary.md`. Three changes drive the bulk of the work: replacing "intensity" with "weight" for arc targets (spec + one comment), updating "title"/"name" to "key" for notes and references (spec-only — code already uses `key`), and renaming `readyStatus` → `readiness` across the codebase.

---

## Scope

### What is already aligned

The codebase already uses `key` uniformly for notes and references (`NoteSchema`, `ReferenceSchema`). Only the specs need updating for that change.

### What needs changing

**Spec-only changes (no code impact):**

- `specifications/aspect-arc-model.md` — "intensity" used throughout as the arc's `y` value; replace with "weight". Close the open question `[ ] 2026-04-26 — Should the spec use "weight" or "intensity"...`.
- `specifications/attachments.md` — "title (notes) or name (references)" appears in structure section, constraints, prior decisions, and acceptance criteria; replace uniformly with "key". Update vault path prose (`notes/<title>.md` → `notes/<key>.md`).
- `specifications/fitting-score.md` — likely uses "intensity" for arc target values; audit and update.
- `specifications/sequencer.md` — audit for "intensity"; update where found.
- Any other spec file that uses "intensity" in an arc context (grep to confirm).

**Code changes:**

- `packages/shared/src/schemas/domain/arc.ts:5` — comment says `// y = target intensity at that position.`; change to `// y = target weight at that position.`

- `readyStatus` → `readiness` rename (cross-cutting):
  - `packages/shared/src/schemas/domain/fragment.ts` — rename field `readyStatus` → `readiness`
  - `packages/shared/src/schemas/domain/project.ts` — rename `readyStatusThreshold` → `readinessThreshold`
  - `packages/shared/src/schemas/domain/action.ts` — update `changedFields` enum value `"readyStatus"` → `"readiness"`
  - `packages/storage/src/db/vault/schema.ts` — rename DB column; write a migration
  - Storage layer: assemblers, upserts, mappers, indexer types, serialize/parse tests
  - API layer: routes, commands, tests that reference `readyStatus`
  - Vault markdown parser/serializer — update frontmatter field name read/written on disk
  - `packages/frontend/src/api/generated/maskorAPI.schemas.ts` — regenerate from OpenAPI spec after backend is updated

---

## Tasks

### Phase 1 — Spec updates

- [x] `specifications/aspect-arc-model.md`: replace "intensity" → "weight" for arc `y` values; close open question.
- [x] `specifications/attachments.md`: replace all "title"/"name" → "key" for notes/references.
- [x] Audit `specifications/fitting-score.md` and `specifications/sequencer.md`; update "intensity" → "weight" where found.
- [x] Grep remaining spec files for "intensity" in arc context; update any found.

### Phase 2 — Comment fix

- [x] `packages/shared/src/schemas/domain/arc.ts:5`: `target intensity` → `target weight`.

### Phase 3 — `readyStatus` rename

- [x] Rename field in `packages/shared/src/schemas/domain/fragment.ts`.
- [x] Rename `readyStatusThreshold` in `packages/shared/src/schemas/domain/project.ts`.
- [x] Update `changedFields` enum in `packages/shared/src/schemas/domain/action.ts`.
- [x] Rename DB column in `packages/storage/src/db/vault/schema.ts`; write a migration.
- [x] Propagate through storage layer (assemblers, upserts, mappers, indexer, tests).
- [x] Propagate through API layer (routes, commands, tests).
- [x] Update vault markdown parser/serializer for the frontmatter field name.
- [x] Regenerate `packages/frontend/src/api/generated/maskorAPI.schemas.ts`.
- [x] Update all fragment files in `packages/test-fixtures/basic-vault/fragments/` — rename `readyStatus:` → `readiness:` in frontmatter.
- [x] Run `bun run verify`; fix all type errors and test failures.
