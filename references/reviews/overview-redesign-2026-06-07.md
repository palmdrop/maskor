# Review: Overview redesign — vertical read/reorder surface with arc overlay

**Date**: 2026-06-07
**Scope**: `packages/sequencer`, `packages/api/src/{commands,routes,schemas}/sequence*`, `packages/frontend/src/pages/OverviewPage`, `packages/frontend/src/lib/{sequences,commands}`, `packages/shared/src/schemas/domain/{action,project}.ts`, `packages/storage/src/registry`
**Plan**: `references/plans/overview-redesign.md`
**Spec**: `specifications/sequencer.md`, `specifications/aspect-arc-model.md`

---

> **Resolution (2026-06-08):** all five findings (#1–#5) fixed. `optimisticGroup`
> now mirrors the server's centre-of-mass placement; navigation no longer forces
> `detail` into the URL; `cloneSequence` drops `origin`; `getSequenceContents`
> logs dropped reads; the DnD unplace branch is narrowed to explicit pool drops.
> Added tests (sequencer clone-origin, `optimisticGroup` placement) and updated
> the navigation test. `bun run verify` green: 930 backend + 558 frontend.

---

## Overall

Cohesive, well-executed implementation covering all four phases of the plan. The pure-function sequencer ops are clean and thoroughly commented; the command/route/optimistic plumbing follows project conventions faithfully (commands pipeline for every mutation, generated orval client throughout, no direct `useMutation` in components, no abbreviated names). Branch is green: 929 backend + 554 frontend tests pass, typecheck clean, OpenAPI snapshot in sync. No surprising data-layer changes — the storage/registry diff is purely the `density → detailLevel` rename.

Three behavior issues are worth addressing before this is considered done: an optimistic-update fidelity gap that causes a visible placement jump (#1), a persistence path where the saved detail level is overridden by navigation (#2), and clones inheriting import provenance (#3). None are data-loss risks.

---

## Bugs

### 1. `optimisticGroup` does not mirror the server's section-placement rule

`packages/frontend/src/lib/sequences/optimisticUpdates.ts:98` vs `packages/sequencer/src/index.ts:359` (`groupFragmentsIntoSection`) — the backend decides the new section's slot by the selection's center of mass within its home section: a selection in the top half lands _before_ the (remaining) home section, one in the bottom half lands _after_ it. The optimistic mirror always splices the new section _before_ the home section:

```ts
sections.splice(insertIndex < 0 ? stripped.length : insertIndex, 0, newSection);
```

```
select bottom-half block → optimistic inserts new section BEFORE home
  → onSuccess refetch → server placed it AFTER home → section visibly jumps
```

For any grouping selection sitting in the lower half of its section, the optimistic placement and the committed (refetched) placement differ, so the new section jumps after `onSuccess` invalidates. Self-heals, but it's exactly the divergence the optimistic mirror exists to prevent.

Fix: replicate the center-of-mass before/after decision from `groupFragmentsIntoSection` in `optimisticGroup` (or accept the flicker and drop the "optimistic mirror" claim in the comment).

### 2. Persisted `detailLevel` is overridden by in-app navigation

`packages/frontend/src/pages/OverviewPage/components/SequenceSidebar.tsx:188,223,252,309`, `components/RightSidebar.tsx:67`, `lib/commands/global/navigation.ts:28` — `project.overview.detailLevel` is persisted via `useUpdateProject`, and `OverviewPage` resolves `detailLevel = urlDetailLevel ?? persistedDetailLevel ?? "prose"`. But every in-app navigation forces `detail` into the URL with a hardcoded `"prose"` fallback:

```ts
search: (prev) => ({ detail: prev.detail ?? "prose", sequence: uuid });
// goToOverview: search: { detail: "prose" }
```

Because the URL value wins over the persisted value, a user who set "excerpt" sees it reset to "prose" the moment they switch sequences, delete/clone/rename a sequence, or jump to the overview from the palette. The persisted field only takes effect on a cold load that has no `detail` search param.

The comments justifying the fallback ("required by validateSearch") are inaccurate — `detail` is optional in `validateSearch` (`router.ts:80`), so the navigations can omit it (or pass `prev.detail` undefined) and let the persisted value apply.

Note: this mirrors the pre-existing `density: prev.density ?? "full"` pattern, so it is carried-over behavior rather than newly introduced — but the plan task "Persist per-project like today's density" is effectively a no-op for any session that navigates.

Fix: stop defaulting `detail` to `"prose"` in the navigation `search` builders; let it stay undefined so the persisted project preference resolves.

### 3. `cloneSequence` copies `origin`, so clones render as "imported"

`packages/sequencer/src/index.ts:584` — the clone carries the source's import metadata:

```ts
...(sequence.origin ? { origin: sequence.origin } : {}),
```

A clone is not an import, but `SequenceSidebar.tsx:378` renders the "imported" badge for any sequence with `origin` and a tooltip claiming it was imported from that file on that date. Cloning an imported sequence produces a misleading provenance badge.

Fix: drop `origin` from the cloned sequence (a clone has no import origin), or confirm inherited provenance is intended and adjust the badge copy.

---

## Design

None.

---

## Minor

### 4. `getSequenceContents` silently drops a placed fragment whose read rejects

`packages/api/src/routes/sequences.ts:699` — `Promise.allSettled` + `toContent` returning `[]` for a missing fragment means a placed fragment whose per-fragment read fails is omitted from the spine with no signal. The row still appears in the reorder list (driven by the index), so the spine and list disagree. Reasonable degradation, but consider logging the rejected reads.

### 5. Unplace-on-unrecognized-drop is broad

`packages/frontend/src/pages/OverviewPage/hooks/useSequenceDnD.ts:116` — the final branch reduces to `isActiveInSequence && (isOverInPool || !isOverInSequence)`, i.e. dropping a placed fragment on anything that is neither a section nor a placed fragment unplaces it. In practice the `closestCenter` collision fallback always resolves `over` to a real droppable inside each context, so this never misfires today — but it depends on that fallback always returning a section/fragment. Worth a guard if a non-droppable region is ever added inside a DnD context.

---

## Non-issues

- **`undoable: true` on group/move/split/merge/insert commands** — there is no undo executor; the flag is action-log metadata only, so it cannot fail at runtime.
- **Two independent `DndContext`s (reorder list vs prose spine)** — intentional; both use raw fragment uuids as draggable ids and dnd-kit requires uniqueness within a context. Cross-surface pool↔spine drag is a deliberately deferred limitation, already tracked in `references/suggestions.md`.
- **`TileContent` / `utils/layout.ts` survive the tile retirement** — kept for the place-in-sequence modal; already tracked in `references/suggestions.md`.
- **`density → detailLevel` rename leaves old manifests with a stale `density` key** — greenfield, no live users; missing `detailLevel` falls back to the `"prose"` default in `PROJECT_CONFIG_DEFAULTS`.
- **ADR 0011 rendering drift (spine prose ≠ Preview/export)** — explicitly accepted; Preview remains the export proof.
