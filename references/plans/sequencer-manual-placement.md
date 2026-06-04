# Sequencer — manual placement (first slice)

**Date**: 11-05-2026
**Status**: Done
**Specs**: `specifications/sequencer.md`, `specifications/overview.md`

---

## Goal

A user can open `/overview`, see all non-discarded fragments of a project as draggable tiles in two zones (an ordered sequence + an unassigned pool), drag a fragment from the pool into the sequence, reorder fragments within the sequence by dragging, and drag a fragment back out to unplace it. Every change persists round-trip: reload preserves order, and the underlying vault file matches what the UI shows.

> This is the manual-placement slice only. Out of this slice: fitting scores, key fragments, semi-random / automatic modes, secondary sequences, noise, deadlock detection, arc overlays, and multiple-sequence UI. Single implicit "main" sequence; single implicit default section. The data model is built spec-shaped (sections present in storage) so adding sections, secondary sequences, and scoring later doesn't require a vault-file migration.

---

## Tasks

### Phase 1 — Data model (`@maskor/shared`)

- [x] Replace the `Sequence` / `Section` TypeScript stubs in `packages/shared/src/schemas/domain/sequence.ts` with proper Zod schemas (`SequenceSchema`, `SectionSchema`, `FragmentPositionSchema`).
- [x] Add `isMain: boolean` and `projectUuid: string` to `Sequence`.
- [x] Add `SequenceCreateSchema` and `SequenceUpdateSchema` (rename, set-main).
- [x] Add `FragmentPositionCreateSchema` (fragmentUuid + sectionUuid + position) and `FragmentPositionMoveSchema` (new sectionUuid + new position).
- [x] Export new types from `packages/shared/src/schemas/domain/index.ts`.
- [x] Spec note: `Section.fragments[].position` is unique per section, 0-based, dense (no gaps). Encode that invariant in a `.superRefine`.

### Phase 2 — Vault file format (`@maskor/storage`)

- [x] Define YAML file layout for `<vault>/.maskor/sequences/<sequence-uuid>.yaml`: `{ uuid, name, isMain, sections: [{ uuid, name, fragments: [{ fragmentUuid, position }] }] }`.
- [x] Add `sequenceMapper` (`packages/storage/src/vault/markdown/mappers/sequence.ts` — name kept consistent with peers even though the file is YAML) with `fromFile` and `toFile`.
- [x] Extend `Vault` in `packages/storage/src/vault/types.ts` with a `sequences` namespace: `read(filename) | readAll() | readAllWithFilePaths() | write(sequence) | delete(filename)`.
- [x] Implement these in `packages/storage/src/vault/markdown/vault.ts`, mkdir-ing `.maskor/sequences/` on first write. Use `Bun.Glob` for listing.
- [x] Add `SEQUENCE_NOT_FOUND` to `VaultErrorCode`.

### Phase 3 — DB schema (`@maskor/storage`)

- [x] Add three tables to `packages/storage/src/db/vault/schema.ts` per the spec's DB-schema table:
  - `sequences` — uuid (PK), name, project_uuid, is_main (bool), file_path (unique), content_hash, synced_at.
  - `sections` — uuid (PK), name, sequence_uuid (FK cascade), position. Composite unique on `(sequence_uuid, position)`.
  - `fragment_positions` — uuid (PK), fragment_uuid (FK fragments cascade), section_uuid (FK cascade), position. Composite unique on `(section_uuid, position)`. Composite unique on `(sequence_uuid, fragment_uuid)` enforced via app logic (sequence_uuid not duplicated here; derive via sections).
- [x] Defer `fitting_scores` and `key_fragments` tables — flag them in the plan's spec note rather than create them.
- [x] Generate a Drizzle migration (`packages/storage/src/db/vault/migrations/20260512_add_sequences.sql`) and registered it in the vault migrations journal.

### Phase 4 — Indexer (`@maskor/storage`)

- [x] Extend `packages/storage/src/indexer/upserts.ts` with `upsertSequence`, `deleteSequenceByFilePath`, mirror helpers from the existing entity upserts.
- [x] Extend `packages/storage/src/indexer/assemblers.ts` and `indexer.ts` with a `sequences` namespace: `findAll`, `findByUUID`, `findMain`, `findFilePath`.
- [x] In rebuild: read all `.maskor/sequences/*.yaml`, upsert each into `sequences` + `sections` + `fragment_positions`.
- [x] On startup, if no sequence exists for the project, **do not** auto-create one — the storage service stays passive. Auto-creation happens at the command layer on first user action (see Phase 6).
- [x] Also enabled `PRAGMA foreign_keys = ON` on the vault DB (was missing; cascades were silently not working).

### Phase 5 — Storage service (`@maskor/storage`)

- [x] Add a `sequences` namespace to `storage-service.ts` exposing: `read(context, uuid)`, `readAll(context)`, `getMain(context)`, `write(context, sequence)` (validates unique-main-per-project and unique-name), `delete(context, uuid)`, `setMain(context, uuid)`.
- [x] Each mutation: write the YAML file via `vault.sequences.write` then upsert into DB inside a transaction (mirror the inline-upsert pattern used by other entities — closes stale-index window).
- [x] No watcher on `.maskor/sequences/`. Spec says startup-rebuild only. Confirmed already excluded via the `/(^|[/\\])\..+/` pattern in chokidar config.
- [x] Reuse `KEY_CONFLICT` for both sequence-name uniqueness and unique-main-per-project violations.

### Phase 6 — Sequencer package (`@maskor/sequencer`)

- [x] Replace `packages/sequencer/src/index.ts` (currently a `console.log` stub) with pure functions that operate on a `Sequence`:
  - `createDefaultSequence(projectUuid, name)` — produces a `Sequence` with one default section ("Main") and an empty fragment list. Marked `isMain: true`.
  - `placeFragment(sequence, fragmentUuid, sectionUuid, position)` — inserts and shifts.
  - `moveFragment(sequence, fragmentUuid, targetSectionUuid, targetPosition)` — removes from old, inserts at new, re-compacts both sections' positions.
  - `unplaceFragment(sequence, fragmentUuid)` — removes and re-compacts.
  - `getUnassignedFragmentUuids(sequence, allFragmentUuids)` — returns the implicit pool: all non-discarded fragments not present in any section.
- [x] Each function is total and pure — input `Sequence`, output `Sequence`. No DB or I/O.
- [x] Add invariants validation: no duplicate fragments across sections within a sequence, positions are dense and 0-based per section.
- [x] Co-locate unit tests in `packages/sequencer/src/__tests__/`.

### Phase 7 — API (`@maskor/api`)

- [x] New router `packages/api/src/routes/sequences.ts` mounted at `/projects/:projectId/sequences` (parallel to `aspects`, `notes`).
- [x] Endpoints:
  - `GET /` — list sequences (lightweight: uuid, name, isMain).
  - `GET /main` — get main sequence in full (sections + positions). Auto-creates the implicit main if none exists, via a command (see below). Returns 200 with the new sequence.
  - `GET /:sequenceId` — full sequence.
  - `POST /` — create named sequence (used later for multi-sequence; included now since the schema supports it).
  - `PATCH /:sequenceId` — rename / set-main.
  - `DELETE /:sequenceId` — delete (refuses to delete the main sequence unless another is promoted first).
  - `POST /:sequenceId/positions` — place a fragment: `{ fragmentUuid, sectionUuid, position }`.
  - `PATCH /:sequenceId/positions/:fragmentUuid` — move: `{ sectionUuid, position }`.
  - `DELETE /:sequenceId/positions/:fragmentUuid` — unplace.
- [x] All mutating routes route through `executeCommand` per `packages/api/CLAUDE.md`.
- [x] Add commands under `packages/api/src/commands/sequences/`:
  - `ensure-main-sequence` (idempotent, creates the implicit main + default section if missing).
  - `create-sequence`, `update-sequence`, `delete-sequence`.
  - `place-fragment`, `move-fragment`, `unplace-fragment`.
- [x] Action log entries: `sequence:fragment-placed` and `sequence:fragment-moved` already exist in `packages/shared/src/schemas/domain/action.ts`. Add `sequence:fragment-unplaced`, `sequence:created`, `sequence:renamed`, `sequence:deleted`, `sequence:set-main` to the discriminated union.
- [x] Each command composes: read sequence → run pure `@maskor/sequencer` function → `storageService.sequences.write(updated)` → return updated sequence + log entries.
- [x] OpenAPI schemas in `packages/api/src/schemas/sequence.ts`.

### Phase 8 — Frontend codegen

- [x] Run `bun run --filter @maskor/frontend codegen` to regenerate Orval hooks after the API routes exist. Assume the API is already running.
- [x] Verify generated hooks: `useGetSequencesMain`, `usePostSequencesPositions`, etc.

### Phase 9 — Frontend view (replace `/overview`)

- [x] Replace `OverviewPage.tsx` content with a sequencer surface (keep the route path `/overview` — sidebar link unchanged).
- [x] Add `@dnd-kit/core` and `@dnd-kit/sortable` to `packages/frontend/package.json`.
- [x] Layout (HTML/CSS, not `<canvas>` — per overview.md prior decision):
  - Left/top: **Sequence zone** — a sortable horizontal row of fragment tiles in order.
  - Right/bottom: **Pool zone** — a wrappable grid of fragment tiles for non-discarded fragments not currently placed.
  - Both zones are `dnd-kit` drop targets and `SortableContext`s.
- [x] Tile component renders fragment title/key and a short excerpt. Sized roughly proportional to content length (can be approximate via word count buckets — full proportionality is in overview.md, not required here).
- [x] Drag interactions:
  - Pool → sequence: `POST /positions` with the drop index.
  - Sequence reorder: `PATCH /positions/:fragmentUuid` with the new index.
  - Sequence → pool: `DELETE /positions/:fragmentUuid`.
- [x] Use React Query's optimistic updates so reorder feels instant; rollback on API error.
- [x] Empty state: if no main sequence exists yet, the page calls `GET /sequences/main` (which auto-creates) and renders an empty sequence + populated pool.
- [ ] Keyboard rearrangement (overview.md scope item: arrow keys) — **defer** to a follow-up plan; manual drag covers the first slice.

### Phase 10 — Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

- [x] `@maskor/sequencer` — unit tests covering placement / move / unplace invariants, including: insert at head, insert at tail, move forward, move backward, move across sections, unplace re-compaction.
- [x] `@maskor/storage` — vault file round-trip (write → read yields identical object), rebuild reads sequences from vault into DB, hash-skip on unchanged content.
- [x] `@maskor/api` — one happy-path integration test per endpoint; conflict cases for unique-main + duplicate placement.
- [x] `@maskor/frontend` — render the page with mocked API; simulate a drag (dnd-kit mocked with captured `onDragEnd`); assert API mutation called with correct payload.

### Phase 11 — Spec hygiene

- [x] Update `specifications/sequencer.md`:
  - Note that this first slice ships single-sequence + single-section + manual-only.
  - Mark "DB schema for sequences/sections/fragment positions is not yet defined" as resolved with the tables introduced here.
  - Leave open questions on key fragments, cooldown, deadlock UX, partial runs, etc.
- [x] Update `specifications/overview.md`:
  - Note that arc overlays, sections-UI, secondary sequences, and zoom/pan are deferred to follow-up plans.
  - Resolved two open questions (pool placement, overview as placement entry point).
- [x] Add a suggestion to `references/suggestions.md` if anything surprising surfaces during implementation (e.g. a clash between the no-watcher rule and a usability gap).

### Phase 12 — Verify

- [x] `bun run snapshot` to regenerate `references/CODEBASE_SNAPSHOT.md`.
- [x] `bun run verify` — fix any type/test failures before stopping.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Sequencer-package tests are the load-bearing layer — every API mutation routes through them, so high coverage there cheaply protects everything downstream. API and frontend tests can focus on the integration seams (payload shapes, optimistic update rollback) rather than re-testing the pure logic.

## Notes

- **Why sections are in storage but not in the UI yet**: keeps the vault file format spec-compliant from day one. Adding section UI later is purely additive (no migration). Without this, we'd ship a single-section file format now and have to migrate every vault when sections arrive.
- **Why no watcher on `.maskor/sequences/`**: spec is explicit. The user is not expected to hand-edit sequence YAML; if they do, the changes are picked up on next Maskor start. Document this in `sequencer.md` if it isn't already obvious from the existing constraint section (it is).
- **Pool is implicit**: there is no `unassigned_pool` table or vault concept — the pool is "all non-discarded fragments minus the ones in any section of the active sequence". Compute it in the frontend from `GET /fragments` ∪ `GET /sequences/main`.
- **Single-sequence assumption in the UI**: the API is multi-sequence-capable from day one, but the frontend hard-codes `GET /sequences/main`. Multi-sequence picker is a follow-up.

DO NOT IMPLEMENT until clearly stated by the developer.

When the plan is implemented, fully or partially, check off the relevant tasks and set the plan status to `Done`, or `In Progress` if partially implemented.
