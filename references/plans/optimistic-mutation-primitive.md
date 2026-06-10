# Optimistic Mutation Primitive

**Date**: 09-06-2026
**Status**: In progress
**Specs**: none (frontend infrastructure; no domain spec applies)

---

## Goal

> One tested `useOptimisticMutation` module owns the snapshot / rollback / settle lifecycle for every optimistic write; `useSequenceMutations` and all four entity editors route through it; the four editors are driven by a registry-backed `useEntityEditor` hook; the shell's insert/extract orchestration moves into a registry-driven hook; the dead `status !== 200` throws are deleted. "Done" = the dance exists in exactly one place, proven by its own unit tests, and `EntityEditorShell` no longer owns entity-mutation logic, with no behavior change in the Overview or any editor.

---

## Context

From the architecture review (candidates 1 + 2 + 3b). Three call shapes hand-roll the same optimistic cache machinery:

- **Entity editors** (`AspectEditor`, `ReferenceEditor`, `NoteEditor`, `FragmentEditor`, `FragmentMetadataForm`) — each carries a bespoke `makeSave` closure: manual snapshot, `setQueryData`, try/catch, rollback, plus a `status !== 200 → throw new Error(...)` block.
- **`useSequenceMutations`** — 8 near-identical `onMutate`/`onError`/`onSuccess` blocks, varying only by which pure reducer from `optimisticUpdates.ts` they call, each repeating the `.map(s => s.uuid === id ? updated : s)` bundle traversal.
- **`EntityEditorShell` (668 lines)** — beyond the editor core it carries a second cluster: insert/extract data orchestration (`eligibleByKind`, `handleInsertOpen/Confirm`, `handleExtract*`, `navigateToEntity`, building mutation inputs from `ENTITY_KIND_META` via the existing `useEntityKindRegistry`). This is entity-mutation logic in a layout component; it belongs beside the registry, not in the shell.

Two facts decided the design (both confirmed by reading source):

- **`customFetch` (`src/api/fetch.ts`) throws `ApiRequestError` on any non-2xx**, carrying the `X-Correlation-Id`. So the editors' `if (result.status !== 200) throw new Error(...)` is **unreachable dead code** — the await already threw. If it ever ran it would strip the correlation id the command system relies on (see `references/adr/0012-command-failure-observability.md`). These blocks are deleted, not consolidated.
- The react-query `onMutate`/`onError` lifecycle in `useSequenceMutations` is the **correct, idiomatic** shape (its `onError` rollback fires precisely because `customFetch` throws). The editors' imperative `makeSave` is the inferior duplicate.

Relationship to existing work: `references/plans/entity-editor-unification.md` already unified the editor **view layer** (`EntityEditorShell`, `useDirtyState`, sidebar slots). This plan unifies the **data layer** beneath that shell. `useLiveFieldSave` is the debounce/serialize seam and stays untouched — only the `makeSave` it is fed gets replaced.

### Resolved design decisions

- **Scope**: primitive + sequence mutations + registry editors (candidates 1, 2, 3b). The Overview selection extraction (3a) is explicitly **out**.
- **Settle behavior**: the primitive supports both, **reconcile by default** — editors write the authoritative server entity back into the single-entity query (no refetch flicker); list/sequence ops invalidate.
- **Delivery shape**: a config factory spread into orval's existing `mutation:` option — never a wrapper that hides the generated hook (per `packages/frontend/CLAUDE.md`). Mirrors how `useSequenceMutations` is already structured.
- **Editor depth**: full `useEntityEditor(kind, uuid)` orchestration — Aspect/Reference/Note bodies collapse to a sidebar plus the hook; FragmentEditor keeps its Margin-pair wiring but consumes the same core.

**Implementation order (3-plan set)**: this is the **foundation** — implement it first. It settles the editor/mutation layer and touches `EntityEditorShell` (Phase 7), so `project-settings-consolidation.md` follows it (that plan also edits the shell, for display settings). `overview-surface-hooks.md` is independent and goes last.

### Constraints the implementation must respect

- The reducer owns the envelope/`status` guard so the primitive stays cache-shape-agnostic.
- The primitive's optimistic reducer receives the mutation **variables** (`apply(previous, variables)`), since react-query's `onMutate` provides them.
- Per-kind variation that legitimately stays in the registry: `selectEntity` (`res.data.fragment` vs `.aspect` vs `.reference` vs `.note`), `selectWarnings` (`.warnings` vs `.warnings.fragments`), and the body field (`content` vs `description`).
- `AspectEditor` deliberately runs **two** `useUpdateAspect` instances so live metadata saves don't toggle the content Save button's `isPending` (`AspectEditor.tsx:40-41`). `useEntityEditor` must preserve this dual-instance split for every kind.
- Hook selection by `kind` is rules-of-hooks-safe because `kind` is fixed per route mount; store **uncalled** hook references in the registry and call the selected one.

---

## Tasks

### Phase 0 — Branch

- [x] ~~Create branch~~ — N/A: implemented on the shared worktree branch `agent/frontend-refactor` (one branch for the whole rollout, per-phase commits)

### Phase 1 — `useOptimisticMutation` primitive — DONE

**Goal**: One module producing the `{ onMutate, onError, onSuccess }` config for any orval mutation. No call sites changed yet.

- [x] Create `src/lib/api/useOptimisticMutation.ts`, generic over cache / variables / response
- [x] Config accepts: `queryKey` (optimistic target), `apply(previous, variables) → next`, optional `reconcile(previous, response) → next`, optional `invalidate: QueryKey[]`
- [x] `onMutate`: cancel queries, snapshot the target, apply the reducer, return the snapshot in context
- [x] `onError`: restore the snapshot
- [x] `onSuccess`: when `reconcile` is present, write its result into the target; otherwise invalidate the target — then invalidate every `invalidate[]` key
- [x] Unit tests: apply-on-mutate, rollback-on-reject, reconcile-vs-invalidate-on-success
- [x] `git commit` (`1002f0d`)

### Phase 2 — Consolidate `useSequenceMutations` (candidate 3b) — DONE

**Goal**: Replace the 8 hand-rolled blocks with the primitive. No Overview behavior change.

- [x] Add a `updateSequenceInBundle(bundle, sequenceId, fn)` lens in `src/lib/sequences/sequenceBundle.ts` to absorb the repeated bundle traversal
- [x] Rewrite each of the 8 mutations as a `useOptimisticMutation({ queryKey: listQueryKey, apply })` call delegating to the existing pure reducer in `optimisticUpdates.ts`
- [x] Confirm the existing Overview / sequence tests still pass unchanged
- [x] `git commit` (`6097b2d`, −214/+125)

### Phase 3 — `unwrap` helper and incidental cleanups (candidate 1 cleanup) — DONE

**Goal**: Introduce the envelope-to-data narrowing helper and fold in the small duplication cleanups the review surfaced nearby. **Adaptation:** the per-editor dead-throw deletions move into Phases 5–6 rather than landing here — those throws live inside `makeSave` / `onKeySave` / `onContentSave`, which the editor migration deletes wholesale, so removing them now would be churn on lines about to disappear. The migrated editors route through `useEntityEditor`, which uses `unwrap` instead of the throw. Only the dead throw in a file that *survives* the migration (`useMarginEditor`) is removed here.

- [x] Add an `unwrap` helper in `src/api/unwrap.ts` (narrows a 2xx envelope to its `data`; trusts `customFetch` to have thrown otherwise). First consumer is `useEntityEditor` (Phase 4); applies only to resolved mutation results, **not** React Query `data` (which can be `undefined` while loading).
- [x] Delete the surviving dead throw in `useMarginEditor.save` (does not read `result.data`, so no `unwrap` needed)
- [~] Editor / metadata-form dead throws (Reference/Note/Aspect/FragmentEditor/FragmentMetadataForm) — **deferred to Phases 5–6** (removed as part of the `useEntityEditor` migration; `entity-editor-shell.tsx:461` insert/extract guard is Phase 7)
- [x] Collapse `QuickSwitcher`'s `entriesByKind` — five near-identical `status === 200 ? data.map(…).sort(…) : []` blocks — using a local `buildSwitcherEntries(kind, items, getKey)` helper (covers all five kinds incl. `sequence` via `getKey`); folded the 5-way `isLoading` / `isError` ORs into a `queries.some(…)` pass. (`unwrap` not used here — these read React Query `data`, guarded for `undefined`.)
- [x] Extract a local `buildImportOptions(format, headingLevel, delimiter)` helper in `FragmentImportPage` for the `options` JSON string built identically in `runPreview` and `handleImport`
- [x] `git commit`

### Phase 4 — Registry rows + `useEntityEditor` (candidate 2 foundation) — DONE

**Goal**: A registry-driven hook returning the full editor core. No editor migrated yet.

- [x] Extend `src/lib/entity-kinds/` with an `ENTITY_HOOKS` record (`entityHooks.ts`): per kind, uncalled `useGet` / `useUpdate` refs, `getEntityQueryKey`, `getListQueryKey`, `idParamKey`, `bodyField`, `selectEntity`, `selectWarnings`, optional `getExtraInvalidateKeys` (fragment → stats). Per-kind type maps (`EntityFor` / `EntityUpdateFor` / `EntityUpdateResponseFor`) re-attach strong types at the hook boundary.
- [x] Create `src/lib/entity-kinds/useEntityEditor.ts` returning `entity`, `isLoading`, `isError`, `isPending` (content-save only), `cascadeWarnings`, `dismissWarnings`, `onKeySave`, `onContentSave`, `makeFieldSave`
- [x] Build the two `useUpdate` instances internally (content vs field) via the Phase 1 primitive; one shared optimistic config — `apply` merges the patch carried in `variables.data`, `reconcile` writes `selectEntity(unwrap(response))`. Extended the primitive with `settleInvalidate[]` (action-log refresh on settle, replacing the editors' `finally`).
- [x] Unit tests for the `ENTITY_HOOKS` selectors (+ primitive `settleInvalidate` tests)
- [x] `git commit`

### Phase 5 — Migrate Aspect, Reference, Note editors (candidate 2) — DONE

**Goal**: Each editor body collapses to a sidebar plus `useEntityEditor`.

- [x] Migrate `ReferenceEditor` (smallest) to `useEntityEditor`; deleted its bespoke `makeSave`, `invalidate`, `onKeySave`, `onContentSave` (and the dead `status !== 200` throws — the Phase 3 deferral)
- [x] Migrate `NoteEditor`
- [x] Migrate `AspectEditor` (color/category/notes live fields via `makeFieldSave`; the dual-instance `isPending` split now lives inside the hook)
- [x] Confirm tests pass; adjusted the seams: AspectEditor test mocks add `getActionLogQueryKey`; `OverviewPage.test` gains `mutateAsync` on the unplace mock and switches its partial `aspects`/`fragments` mocks to `importOriginal` (entityHooks now references all four entity modules transitively)
- [x] `git commit`

### Phase 6 — Migrate FragmentEditor and FragmentMetadataForm (candidate 2) — DONE

**Goal**: The fragment surfaces share the same core while keeping the Margin pair.

- [x] Route `FragmentEditor`'s entity load + key save through `useEntityEditor`; the coupled content save now wraps `editor.onContentSave` (fragment + stats + list + action log) with the Margin flush + swap-clear, gated on `isProseDirty`. Discard/restore keep their own `invalidateFragment` / `invalidateActionLog`.
- [x] Replace `FragmentMetadataForm`'s bespoke `makeSave` with `useEntityEditor(...).makeFieldSave` for readiness / references / aspects (the redundant `applyToFragment` collapsed — the primitive merges the patch carried in the mutation variables)
- [x] Confirm fragment editor + metadata-form tests pass; added `getActionLogQueryKey` to the fragment test action-log mocks
- [x] `git commit`

### Phase 7 — Extract insert/extract orchestration from `EntityEditorShell`

**Goal**: Move the entity-mutation cluster out of the shell into a registry-driven hook, leaving the shell as layout. Depends on the registry being in place (Phase 4).

- [ ] Create `useEntityInsertExtract(projectId, kind, uuid)` near the entity-kinds registry
- [ ] Move `eligibleByKind`, `handleExtractOpen/Close/Success`, `handleInsertOpen/Close/Confirm`, and `navigateToEntity` into it; source mutation inputs from the registry rows (existing `useEntityKindRegistry`, harmonized with the Phase 4 additions)
- [ ] `EntityEditorShell` consumes the hook and renders the extract / append-prepend dialogs from its returned state — no mutation logic left in the shell
- [ ] Confirm extract-to-entity and append/prepend flows still work (existing tests + manual check)
- [ ] `git commit`

### Phase 8 — Verify and close

- [ ] `bun run format`
- [ ] `bun run verify` — fix any lint / type / test failures
- [ ] Remove any `references/suggestions.md` entries made obsolete by this work
- [ ] Set this plan's status to `Done` (or `In progress` if partial)
- [ ] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The primitive is the new test surface: `useOptimisticMutation` gets dedicated unit tests for apply / rollback / reconcile-vs-invalidate, replacing the rollback dance currently re-proven implicitly across editor tests. The pure reducers in `optimisticUpdates.ts` already have tests and must stay green through Phase 2. Editor tests should shrink toward "sidebar renders + hook is wired," not the cache mechanics.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. No domain spec applies, so there is no `shipped` frontmatter to update; if any spec is later found relevant, update its frontmatter accordingly.
