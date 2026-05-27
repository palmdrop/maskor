# Backend Type Deduplication

**Date**: 27-05-2026
**Status**: Done

---

## Goal

Adding or changing a field on a backend domain entity should require editing exactly one schema. After this refactor, the canonical zod schema in `@maskor/shared` (and `drizzle-zod`-derived schemas for row shapes) drive every downstream shape: `ProjectRecord`, `ProjectManifest`, `FragmentStats`, and the inline patch types on storage methods. No hand-written TS type may mirror a zod schema or a drizzle table without a documented semantic reason.

---

## Context

This plan continues the work begun in `zod-first-shared-schemas.md` (Done, 2026-04-21), which made zod the source of truth for **domain** types but explicitly left drizzle row types and storage-internal intermediate types alone. The cost of that boundary is now visible: the commit `32bb4fa` added a single optional field (`suggestion.currentFragmentUUID`) and had to edit four parallel shapes — `ProjectSchema` (zod), `ProjectManifest` (TS), `ProjectRecord` (TS, with the developer's own TODO "couldn't this be inferred from the schema?"), and the inline `updateProject` patch literal. `ProjectUpdateSchema` in shared was *not* updated to match, so the public update contract has already silently drifted from the internal one.

A grep also confirms `FragmentStats` (`packages/storage/src/suggestion/stats-repo.ts:5-13`) duplicates `fragmentStatsTable.$inferSelect`, and `drizzle-zod` is not in use anywhere in the repo. The pattern is pervasive, not isolated.

**Out of scope for this plan**:

- Moving `currentFragmentUUID` out of the project manifest into a `suggestion_state` table. Tracked in `references/suggestions.md` as a separate concern; will be handled in its own plan once the type infrastructure here is in place.
- API request/response schemas that genuinely differ from domain (e.g. `SuggestionCurrentResponseSchema` returning a full `Fragment`). These stay as endpoint-specific zod objects; the plan only targets shapes that *mechanically* mirror a canonical source.
- Frontend types. Orval codegen already derives those from the OpenAPI spec.

---

## Tasks

### Phase 1 — Branch and audit

- [x] Create branch `backend-type-deduplication` from `main`
- [x] Inventory every hand-written TS type in `packages/storage/src/**` and `packages/api/src/**` that overlaps with a zod schema or drizzle table. For each, record:
  - file:line
  - canonical source it mirrors (zod schema path, drizzle table name)
  - classification: **mechanical** (rename, partial, defaults, omit/pick) or **semantic** (genuinely different fields / constraints)
  - if mechanical, the smallest zod operation that would produce it (`.partial()`, `.pick()`, `.omit().extend()`, `createSelectSchema(...)`, etc.)
- [x] Write the inventory to `references/plans/backend-type-deduplication-audit.md` as a table. This artefact informs every subsequent phase — if the inventory shows mostly semantic differences, the plan's scope shrinks.
- [x] Pause for developer review of the audit before proceeding to Phase 2. The audit may reveal the listed "known offenders" below are not the highest-leverage targets.

### Phase 2 — Adopt drizzle-zod and add derivation helpers

- [x] Add `drizzle-zod` to `packages/storage`
- [x] In `packages/shared/src/schemas/`, add a small helpers module with: `deepPartial(schema)` (recursive `.partial()` for nested object schemas), `withDefaults(schema, defaults)` (apply a defaults object during parse), and any other primitive the audit identified as common. Keep this module small — these are utilities, not a framework.
- [x] Add tests for the helpers (round-trip a known nested schema through `deepPartial` and `withDefaults`, confirm types and runtime parse behaviour)
- [x] `git commit`

### Phase 3 — Replace `ProjectRecord` and `ProjectManifest`

The most-touched offender, and the one that motivated this plan.

- [x] Decide on the `uuid` vs `projectUUID` rename. Decision: keep `uuid` on `ProjectSchema`, accept `Omit<Project, 'uuid'|...> & { projectUUID }` derivation. Renaming would require touching all API and frontend callers.
- [x] Derive `ProjectManifest`'s `config` shape from `Omit<ProjectUpdate, 'name'>`. The envelope (`projectUUID`, `name`, `registeredAt`, `config?`) stays as a literal.
- [x] Replace the hand-written `ProjectRecord` in `packages/storage/src/registry/types.ts` with a derivation from `Project` (shared).
- [x] Remove the `// TODO: couldn't this be inferred from the schema?` comment.
- [x] Verify `toProjectRecord` still typechecks; simplify if the rename made the mapping trivial.
- [x] Run `bun run typecheck` and `bun run test` for `packages/storage`. Fix any drift.
- [x] `git commit`

### Phase 4 — Replace `FragmentStats` with `drizzle-zod`

- [x] Replace `FragmentStats` with `typeof fragmentStatsTable.$inferSelect` — trivial one-liner.
- [x] Delete the hand-written type in `packages/storage/src/suggestion/stats-repo.ts:5-13`. Keep `defaultStats(...)` (runtime values, not a type).
- [x] Verify all callers still typecheck.
- [x] Apply same derivation pattern to all Indexed* types in `indexer/types.ts`: each is now `Omit<DomainType, field> & { filePath }` or `DomainType & { filePath, contentHash }`.
- [x] Removed `IndexedFragmentAspect` — now inlined through `Fragment['aspects']` (AspectWeights).
- [x] Run tests, `git commit`.

### Phase 5 — Replace inline `updateX` patch literals with `XUpdate` from shared

- [x] Update `packages/shared/src/schemas/domain/project.ts` so `ProjectUpdateSchema` includes `currentFragmentUUID` in suggestion — fixes silent drift.
- [x] Type `registry.updateProject(projectUUID, patch)` with `ProjectUpdate`. Removed the inline literal at `registry.ts:262-279`.
- [x] `storageService.updateProject` also typed with `ProjectUpdate`.
- [x] Convention: `XUpdateSchema`s are written separately with explicit optional fields (not auto-derived via deepPartial) since only a subset of fields is updatable in most cases.
- [x] Run tests, `git commit`.

### Phase 6 — Centralise config defaults

- [x] Defined `PROJECT_CONFIG_DEFAULTS` constant in `registry.ts`. Not embedded in `ProjectSchema` to avoid changing input/output types for all callers.
- [x] Refactored `toProjectRecord` to use spread merge `{...defaults, ...config}` — collapsed from 16-line `??` chain.
- [x] Refactored both `registerProject` branches to reference `PROJECT_CONFIG_DEFAULTS`.
- [x] Generalised `writeVaultManifest`'s config merge via `CONFIG_SECTION_KEYS` array — new sections no longer require editing the merge body.
- [x] Run tests, `git commit`.

### Phase 7 — Verify and close

- [x] `bun run verify` from repo root — 36 test files, 398 tests, 0 failures, types clean.
- [x] Set plan status to Done.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Type-level changes need compile-time verification — relying on `bun run typecheck` is the baseline. Where runtime behaviour changes (defaults shifting from `??` chains to `.default()`-via-`parse()`, or `writeVaultManifest` merge logic generalising), add or extend tests in `packages/storage/src/__tests__/registry.test.ts` to confirm parity with the previous behaviour, especially:

- Reading a manifest with missing config fields applies the same defaults as before.
- Writing a partial config patch merges into the on-disk manifest exactly as before (round-trip a manifest through write+read and assert deep equality).
- An update patch typed as `ProjectUpdate` is accepted by `updateProject` and an unknown field is rejected (or stripped, depending on the existing convention — confirm in the audit).

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

The audit (Phase 1) is the most important phase. If the inventory shows most hand-written types are semantically distinct from their apparent canonical source, the plan should shrink to only the genuine mechanical duplicates. Do not force unification where the shapes differ for a real reason — that introduces accidental coupling and obscures intent. Push back if Phase 2+ start to feel like reaching.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. No spec updates are expected — this is internal type plumbing with no user-facing surface.
