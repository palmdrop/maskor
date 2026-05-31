# Import-sequence

**Date**: 31-05-2026
**Status**: Todo
**Specs**: `specifications/import-pipeline.md`, `specifications/sequencer.md`, `specifications/overview.md`

---

## Goal

> Importing a document creates one editable, non-main "import-sequence" that records the imported fragments in their original order; it carries an `origin` pointing to the original file archived byte-for-byte under `.maskor/imports/`, is created inactive so it does not constrain the main sequence until the user opts in, and re-importing a file whose name was imported before surfaces a warning in the preview that the user can proceed past.

---

## Background

Resolved through a grilling session (see glossary terms **Import-sequence**, **Active**, **Origin**, **Import archive**, and `references/adr/0004` + `0005`). Key decisions:

- An import-sequence is a **normal editable `Sequence`**, non-main — no new entity, no discriminator.
- A new `active` flag on **every** sequence gates whether the sequencer consumes it as a constraint. User-authored sequences default `active: true` (preserves today's behavior); import-sequences are created `active: false`.
- The original uploaded file is archived **byte-for-byte** under `.maskor/imports/`; the sequence's optional `origin` references it. This reverses `import-pipeline.md`'s "source discarded" resolution.
- Import does **not** seed the main sequence; fragments land in the main pool unplaced as today, and the order lives only in the import-sequence.
- The pool is unchanged (shown everywhere).
- Re-import of the same file name is allowed but warned.

---

## Tasks

### Phase 1 — Data model: `active` + `origin`

- [x] Create a branch `import-sequence` based on this plan title. _(2026-05-31)_
- [x] Add `active: boolean` and optional `origin` to the domain schema in `packages/shared/src/schemas/domain/sequence.ts` (`SequenceSchema`; `SequenceCreateSchema` with `active` defaulting to `true`; `SequenceUpdateSchema` with `active` optional). `origin` shape: `{ fileName, archivePath, format, importedAt }`, all required within the object, object itself optional. _(2026-05-31)_
- [x] Round-trip `active` and `origin` through the vault file mapper `packages/storage/src/vault/markdown/mappers/sequence.ts` (read with a safe default of `active: true` for pre-existing files that lack the field). _(2026-05-31)_
- [x] Add an `active` column (boolean, default `true`) and an `origin` JSON column (nullable) to `sequencesTable` in `packages/storage/src/db/vault/schema.ts`, plus a migration file (`20260531_add_sequence_active_and_origin.sql`) registered in the drizzle journal. _(2026-05-31)_
- [x] Persist `active`/`origin` in `packages/storage/src/indexer/upserts.ts` (`upsertSequence`) and surface them on `IndexedSequence` in `packages/storage/src/indexer/assemblers.ts`. _(2026-05-31)_
- [x] Update `createSequenceCommand` and `updateSequenceCommand` to accept/pass `active` (and `origin` on create); added `sequence:activated`/`sequence:deactivated` action-log types + history renderer cases. _(2026-05-31)_
- [x] Run `bun run codegen` to regenerate the OpenAPI snapshot + frontend client. _(2026-05-31)_
- [x] Tests: mapper round-trips `active`/`origin` + defaults legacy files to active; `createSequence` defaults `active: true`; `updateSequence` toggles `active`. _(2026-05-31)_
- [ ] `git commit`.

### Phase 2 — Sequencer active-gating

- [x] Change the secondaries filter in `buildBundledResponse` (`packages/api/src/routes/sequences.ts`) from `!s.isMain` to `!s.isMain && s.active` for both `detectCycles` and `computeViolations`. _(2026-05-31)_
- [x] Confirmed `buildBundledResponse` is the only caller of `computeViolations`/`detectCycles`; the sequencer stays pure (no internal active filter). _(2026-05-31)_
- [-] Reconcile the soft/hard-constraint wording — moved to Phase 7 (spec updates).
- [x] Tests: a cycle from two active secondaries disappears when one is deactivated. _(2026-05-31)_
- [ ] `git commit`.

### Phase 3 — Archival + import-sequence creation

- [x] Added `storageService.imports.archive(context, archiveFileName, bytes)` writing under `.maskor/imports/` (wrapped in `withVaultWriteLock`), returning the vault-relative `archivePath`. Archive filename keyed to the import-sequence UUID. _(2026-05-31)_
- [x] Extended the import command: builds one `Sequence` (single "Import" section) holding the created fragments in import order, `isMain: false`, `active: false`, `origin` populated; unique name `Import: <sourceFileName>` with numeric suffix on collision. _(2026-05-31)_
- [x] Only successfully created fragment UUIDs are placed; no sequence/archive when zero fragments created. _(2026-05-31)_
- [x] `importSequenceUuid` added to `ImportResult` + `ImportResultSchema` and recorded on the `fragment:imported` payload (single-entry convention kept). _(2026-05-31)_
- [x] Tests: inactive non-main sequence; import-order section; `origin` populated; archive file exists; name-collision suffix; payload carries UUID; no sequence on empty import. _(2026-05-31)_
- [ ] `git commit`.

### Phase 4 — Re-import warning

- [x] Extended the preview command with an optional `priorImport { sequenceName, importedAt }` (matched on an existing sequence's `origin.fileName`); added `ImportPreviewResultSchema` (PreviewResultSchema + optional `priorImport`) so sequence preview stays untouched; route returns it. _(2026-05-31)_
- [x] Ran `bun run codegen`. _(2026-05-31)_
- [x] Tests: preview returns `priorImport` after a matching import; absent for a fresh name. Import is never server-side blocked. _(2026-05-31)_
- [ ] `git commit`.

### Phase 5 — Frontend

- [x] Import preview page renders a non-blocking amber warning banner (`role="status"`) when `priorImport` is present; Import stays enabled. _(2026-05-31)_
- [x] Sequence sidebar: per-row active toggle (link/link-off icon) dispatched through a new parameterized `overview:toggle-sequence-active` command → `updateSequence`; inactive non-main rows are dimmed; `origin` shows an "imported" badge with a provenance tooltip. _(2026-05-31)_
- [x] Import-sequences appear in the sidebar like any sequence (normal listing + the imported badge/dim). _(2026-05-31)_
- [x] `bun run codegen` already run in Phases 1/3/4. _(2026-05-31)_
- [x] Tests: warning banner present/absent; active toggle activates/deactivates with the right payload; full frontend suite green (440). _(2026-05-31)_
- [ ] `git commit`.

### Phase 6 — Formatting & verification

- [ ] `bun run format` then `bun run verify`; fix lint/test/snapshot issues.
- [ ] `git commit`.

### Phase 7 — Spec updates (drift + Shipped)

> These are not optional clean-up. The design here reverses a documented decision and resolves a known spec inconsistency, so the spec bodies must change alongside the code — not just the `Shipped` log.

- [ ] `specifications/import-pipeline.md`:
  - [ ] Reverse the resolved open question "Should the original source file be archived…? Resolved 2026-05-15: Discarded." — re-open/replace with the new resolution (archived byte-for-byte under `.maskor/imports/`, referenced by the import-sequence's `origin`).
  - [ ] Update the matching **Prior decisions** entry that asserts no archival.
  - [ ] Add a **Behavior** subsection: import creates an inactive non-main import-sequence recording piece order, and archives the original bytes.
  - [ ] Add a `Shipped` entry once implemented.
- [ ] `specifications/sequencer.md`:
  - [ ] Add `active` to the `sequences` row in the **DB schema** table and note `origin` on the sequence model; mention the `.maskor/imports/` archive.
  - [ ] Update the **Secondary sequences** behavior to state that secondaries constrain only while `active`, and that import-sequences are auto-created inactive.
  - [ ] Reconcile the soft/hard-constraint wording (shipped log line ~10 says "soft", behavior line ~72 says "hard"): state that constraints are advisory (detected + reported), gated by `active`. Clear the corresponding glossary "Flagged ambiguity" once the spec is consistent.
  - [ ] Add a `Shipped` entry once implemented.
- [ ] `specifications/overview.md`:
  - [ ] Document that the sequence picker lists import-sequences, exposes an active/inactive toggle, and indicates import provenance (`origin`).
  - [ ] Add a `Shipped` entry once implemented.
- [ ] Set this plan's Status to `Done` (or `In Progress` if partial) and add `Closed` date.
- [ ] Final `git commit`.

---

## Open questions / decisions to confirm during implementation

- **`origin` in DB**: stored as a JSON column on `sequencesTable` so the picker can show provenance without reading the vault file. Confirm `IndexedSequence` is the right carrier (it is assembled from DB rows in `assemblers.ts`).
- **Archive filename scheme**: `<sequenceUuid>.<ext>` keeps re-imports from colliding and ties the archive to its sequence; `origin.fileName` preserves the original display name. Confirm this over name-based filenames.
- **`active` for the main sequence**: irrelevant (the main sequence is the constraint target, not a constraint). Left `true`; the sequencer only filters non-main sequences.
- **Draft size**: `.maskor/imports/` is swept into Draft snapshots (ADR-0005). No mitigation planned now; flag if it bites.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.
