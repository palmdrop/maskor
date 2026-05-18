# Review: Secondary Sequences (slice 2)

**Date**: 2026-05-18
**Scope**: `packages/sequencer/`, `packages/api/src/commands/sequences/`, `packages/api/src/routes/sequences.ts`, `packages/api/src/schemas/sequence.ts`, `packages/frontend/src/pages/OverviewPage/`, `packages/frontend/src/router.ts`, `packages/storage/src/service/storage-service.ts`
**Plan**: `tasks/prd-secondary-sequences.md`
**Spec**: `specifications/sequencer.md`

---

## Overall

Slice 2 lands the full vertical of secondary sequences: pure sequencer functions, section CRUD commands, bundled API responses, left/right sidebars, status indicators, and section-aware editing pane. The sequencer core (`getFragmentOrder`, `computeViolations`, `detectCycles`) is correct and well-tested. The API and command layer match the PRD cleanly.

The frontend, however, has a **load-bearing bug in the drag mutation flow** that crashes the editing pane after every successful drag. The root cause is a cache-shape mismatch introduced when the API moved to bundled responses (US-007) without migrating the optimistic-update site. The follow-on effect is that violations/cycles also stop refreshing after drag-drop. Both issues stem from a structural choice (two parallel caches for the same data) that the bundled-response design was meant to obsolete.

The setMain implementation also has a narrow filesystem race against the watcher that warrants ordering the writes differently.

---

## Bugs

### 1. Drag mutations corrupt the active-sequence cache → next render crashes

`packages/frontend/src/pages/OverviewPage/index.tsx:268-274, 295-301, 319-324` — `placeFragment` / `moveFragment` / `unplaceFragment` all share the same `onSuccess` shape:

```ts
onSuccess: (data) => {
  if (data.status !== 200) return;
  queryClient.setQueryData<GetMainSequenceResponse>(activeQueryKey, (previous) => {
    if (!previous || previous.status !== 200) return previous;
    return withUpdatedSequence(previous, data.data);  // ← wrong shape
  });
},
```

Per the generated client (`PlaceFragmentResponse200.data: SequenceBundledResponse`), `data.data` is `{ sequences, violations, cycles }`. But `activeQueryKey` points at `getGetMainSequenceQueryKey` / `getGetSequenceQueryKey`, both of which hold a single `Sequence` as `data`. `withUpdatedSequence` blindly stuffs the bundle in.

```
mutation success → cache.data = { sequences, violations, cycles }
                 → sequence = sequenceEnvelope.data (now the bundle)
                 → sectionsData useMemo → sequence.sections.map(...)
                 → TypeError: cannot read .map of undefined
```

The optimistic-update path in `onMutate` (lines 256-267) is correct because `optimisticPlace` is typed `(Sequence, ...) => Sequence`. Only `onSuccess` is wrong.

Fix: in each `onSuccess`, pick the matching sequence out of the bundle — `data.data.sequences.find((s) => s.uuid === sequence.uuid)` — and write that. Better still, drop the dual-cache pattern entirely (see #5).

### 2. Drag mutations leave violations, cycles, and status dots stale

Same three mutations (`packages/frontend/src/pages/OverviewPage/index.tsx:254-330`) never invalidate `listQueryKey`. The bundle that drives the sidebar status dots, per-fragment violation glyphs (US-019), cycle indicators (US-020), and right-sidebar warnings panel (US-022) does not refresh until the user navigates away or triggers a non-drag mutation.

This violates **FR-12** ("Violations and cycles are recomputed live on every read of the sequence list") and **US-007 AC** ("All mutating commands ... return the same bundled shape"). The server returns the freshly-computed bundle in the response; the frontend discards everything except (the incorrectly-typed) `data`.

`designateMain` (line 334), `createSection` (line 348), `renameSection` (line 365), and `deleteSection` (line 384) all invalidate `listQueryKey` correctly. The fragment mutations are the only outliers.

Fix: add `void queryClient.invalidateQueries({ queryKey: listQueryKey });` to each `onSuccess` — or fold into the refactor in #5.

### 3. `setMain` writes vault files in an order that briefly leaves two `isMain: true` files on disk

`packages/storage/src/service/storage-service.ts:1454-1485` — the order is:

1. `vault.sequences.write(promoted)` — new main written with `isMain: true`
2. `vault.sequences.write(demoted)` — old main written with `isMain: false`
3. DB transaction upserts both rows atomically in (demoted, promoted) order

Between steps 1 and 2, two YAML files on disk have `isMain: true`. The watcher subscribes to file events and runs `upsertSequence` outside this transaction. If the watcher debouncer flushes the promoted-file event before step 2 completes, the upsert sees `is_main = true` on a row whose sibling (the still-old-main) also has `is_main = true` in the DB → partial unique index violation.

```
write promoted (isMain: true)
  ↓
watcher fires → upsertSequence(promoted) → DB now has two is_main=true rows? No,
                actually the watcher would set is_main=true on the new row
                while the old row is still is_main=true → constraint hits
  ↓
write demoted (isMain: false) — too late
```

Fix: demote first, promote second. The intermediate state then has zero `isMain: true` files on disk, which is harmless. Or wrap the whole sequence in a `watcher.pause()` / `watcher.resume()` block, mirroring `index.rebuild` (line 1522). PRD US-005 AC ("Partial unique index on `sequences.is_main` is not violated at any point during the transaction") is technically met for the DB transaction, but the spirit covers the disk state too.

---

## Design

### 4. Two parallel caches for the same data

`OverviewPage` reads from three queries: `useListSequences` (bundle with full sequences + sections + violations + cycles), `useGetMainSequence`, and `useGetSequence`. The bundle already contains everything the editing pane needs; the per-sequence fetches duplicate state into a separate cache that mutations then have to keep in sync — which is exactly what produces bugs #1 and #2.

`useListSequences` query data is already keyed by `projectId` and refetched after every mutation that invalidates the list key. Reading the active sequence as `bundle.sequences.find((s) => s.uuid === activeSequenceId) ?? bundle.sequences.find((s) => s.isMain)` removes the dual cache, removes the cache-shape mismatch, and removes the staleness window for violations.

The whole `withUpdatedSequence` helper (line 51), the optimistic-update wrappers, and the redundant invalidations in `refreshActiveSequence` (line 343) all fall out.

### 5. `useGetMainSequence` fires unconditionally

`packages/frontend/src/pages/OverviewPage/index.tsx:141` — runs on every render of the page, including when the user is viewing a secondary. Gate behind `!activeSequenceId`, or eliminate as part of #4.

### 6. `withUpdatedSequence` casts away a real type mismatch

`packages/frontend/src/pages/OverviewPage/index.tsx:51-56` — typed as taking `GetMainSequenceResponse` but used for both main and specific-sequence caches via a `GetMainSequenceResponse | GetSequenceResponse` union elsewhere. The `as GetMainSequenceResponse` cast on the return value is exactly the spot that would otherwise catch bug #1 at type-check time. Either parameterize or remove (see #4).

---

## Minor

### 7. Status dot for the main sequence row never reflects violations

`packages/frontend/src/pages/OverviewPage/components/SequenceSidebar.tsx:19-27` — `sequenceStatus` checks `cycles.some(c => c.sequenceUuids.includes(sequence.uuid))` and `violations.some(v => v.secondaryUuid === sequence.uuid)`. For the main row, the second clause never fires (violations have `secondaryUuid`, not main's uuid). PRD US-012 says "amber = has violations against main"; ambiguous whether main itself should ever go amber. Worth picking a side and either documenting or reflecting in the status logic.

### 8. Style drift from CODING_STANDARDS

The coding standards prefer arrow functions, but several new helpers are written as `function` declarations:

- `packages/frontend/src/pages/OverviewPage/index.tsx:51` — `function withUpdatedSequence`
- `packages/frontend/src/pages/OverviewPage/components/SequenceSidebar.tsx:19, 29, 33` — `function sequenceStatus`, `function fragmentCount`, `function generateDefaultName`
- `packages/frontend/src/pages/OverviewPage/components/RightSidebar.tsx:11, 32` — `function buildMembership`, `function isInMain`
- `packages/sequencer/src/index.ts:3, 189, 218, 295` — internal helpers also use `function`

Project convention is arrow functions unless a hoist is required.

### 9. Inline-rename "create then rename" exposes the default name on cancel

`packages/frontend/src/pages/OverviewPage/components/SequenceSidebar.tsx:152-171` — `handleCreate` calls `createSequence.mutate` with the default name *first*, then enters inline-rename mode. If the user presses Escape, the sequence is left in the project with the default name ("New sequence"). PRD US-013 AC says "pressing Escape reverts to the default name", which the current code technically satisfies, but the UX implication is that escape leaves a half-named row behind. Not a bug, just worth being aware of.

### 10. `handleCommitRename` reinvents `mutateAsync`

`packages/frontend/src/pages/OverviewPage/components/SequenceSidebar.tsx:191-219` — wraps `updateSequence.mutate` in a manual `new Promise(...)`. `mutateAsync` from react-query exists for this exact use case and would be a few lines shorter.

### 11. Section delete confirmation shows count even at zero

`packages/frontend/src/pages/OverviewPage/index.tsx:529-538` — when `sectionData.fragmentUuids.length === 0`, the "N fragments will return to the pool" hint is hidden (good), but the prompt "Delete section?" lacks any indication that the section is empty. Tiny copy issue. Not in PRD.

### 12. `createSection` flow assumes the new section is always the last in the response

`packages/frontend/src/pages/OverviewPage/index.tsx:352-359` — uses `updatedSeq.sections[updatedSeq.sections.length - 1]` to identify the freshly-created section. Relies on the API guarantee that new sections append at the highest position + 1 (which the command does honor). Fragile in principle; consider returning the new section's UUID from the API so the frontend doesn't have to infer.

---

## Non-issues

- **`computeViolations` builds full pairwise edges per secondary, not adjacent-only** — Intentional and required for correctness. With full pairwise edges, a contradiction like X:`A→B→C→D` vs Y:`D→A` yields SCC `{A, D}`, correctly excluding B and C. Adjacent-only edges would wrongly grow the SCC to `{A, B, C, D}`. The PRD's "pairwise constraint edges" wording matches this implementation.
- **Bundle includes full sequence content (sections, fragments) for every sequence** — Intentional per US-007. The single-payload design is what enables the right sidebar's cross-sequence membership panel (US-021).
- **Sections don't have an explicit `position` field on the YAML** — Order is implicit in the array. Matches the existing schema and the section-position-from-array-index convention used in the indexer.
- **`useNavigate` from the sidebar omits `from`** — Absolute `to` paths don't require it. The navigation works correctly; the earlier report of "sidebar doesn't switch sequences" was a misreading of the UI.
- **Section CRUD commands don't emit `logEntries`** — Sections aren't on the action log spec yet. Consistent with how other section-grain mutations are handled.

