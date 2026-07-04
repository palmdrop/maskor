# Discard ↔ sequence coherence + split partial-failure integrity

**Date**: 04-07-2026
**Status**: Todo
**Specs**: `specifications/sequencer.md`, `specifications/fragment-model.md`, `specifications/fragment-split.md`
**Branch**: agent/discard-and-split-integrity

---

## Goal

> Discarding a placed fragment is reflected immediately and consistently in every surface (no stale placement in the sidebar/overview, no failing "remove from sequence" afterwards), and a fragment split either fully succeeds or reports honestly — a committed split never surfaces as "Split failed".

---

## Background (investigated 04-07-2026)

**Discard bug** (`references/TODO.md`: "discarding a fragment in a sequence does not remove it in the frontend…"):

- Backend `fragments.discard` (`packages/storage/src/service/storage-service.ts:1145`) moves the file + index row and cascades the Margin — it never touches sequence placements. No sequence read path filters discarded placements either (`getSequenceContents` includes all placed UUIDs regardless of discard).
- Frontend `handleDiscard` (`packages/frontend/src/components/fragments/fragment-editor.tsx:243`) invalidates only the fragment + fragment-list queries — never `getListSequencesQueryKey` / sequence contents. So the sequence sidebar and Overview keep showing the fragment from cache, and subsequent sequence operations run against a desynced picture.
- `unplaceFragment` (`packages/sequencer/src/index.ts:167`) throws "not placed" when the placement is gone — the reported "remove from sequence fails" follow-up. Reproduce the exact failure while fixing; the user's hypothesis (backend already removed it) does not match the code, so find what actually failed.

**Split bug** (`references/TODO.md`: "fragment split still 'fails', but actually succeeds"):

- `splitFragmentCommand` (`packages/api/src/commands/fragments/split-fragment.ts`) performs many sequential writes with no atomicity: write new fragments (line ~157) → truncate the original (~167) → rewrite every sequence (~204) → migrate Margins (~232/243). A throw anywhere after the first fragment write returns 500 → the dialog shows "Split failed. Try again." (`SplitFragmentDialog.tsx:217`) — yet fragments are already on disk. This is the remaining "claims to fail but succeeded" vector (the two earlier fixes — refetch decoupling 2026-06-18, save-before-split 2026-06-25 — closed the frontend vectors).

---

## Tasks

### Phase 0 — Branch

- [x] Create branch `agent/discard-and-split-integrity` from main.

### Phase 1 — Discard removes the fragment from sequences (backend)

- [x] Extend the discard flow so discarding a fragment unplaces it from **every** sequence containing it (compose the existing `unplaceFragment` sequencer function; skip sequences that don't contain it). Decide placement: inside `discardFragmentCommand` (command-level composition, mirrors how `split-fragment.ts` composes placement) rather than inside storage `discard` — commands own multi-entity orchestration. **Note:** unplace runs BEFORE `fragments.discard` — the `fragment_positions` cascade means discarding first would drop placement index rows while the YAML files kept the fragment (index/disk divergence). See `references/suggestions.md`.
- [x] Restore semantics: restoring a discarded fragment does **not** re-place it (it returns to the pool). Documented in `restore-fragment.ts` and the specs.
- [x] Action log: keep one `fragment:discarded` entry; include the removed placements in its payload (`unplacedFromSequenceUuids`) so the entry explains the side effect. No separate `sequence:fragment-unplaced` entries (mirrors `fragment:split`'s single-entry convention).
- [x] Import-sequences: **left intact.** Read-only snapshots (carry an `origin`) cannot be mutated — the sequencer forbids it and a snapshot legitimately records what was imported. Skipped in the unplace loop; their YAML placements stay on disk.
- [x] Tests (API/storage): discard removes placements from all containing sequences; restore does not re-place; discard of an unplaced fragment leaves sequences untouched; read-only import-sequences left intact. (`packages/api/src/__tests__/commands/discard-fragment.test.ts`)

### Phase 2 — Frontend cache coherence on discard/restore

- [x] Invalidate sequence caches on discard and restore. New reusable `useInvalidateSequences` hook (`packages/frontend/src/lib/sequences/useInvalidateSequences.ts`) — a URL-prefix predicate covering the whole generated family (list, main, individual, contents) in one call. Wired into `fragment-editor.tsx` `handleDiscard`/`handleRestore` and the fragment-list discard/restore path (`FragmentListPage.tsx` `discardFragmentAction`/`restoreFragmentAction`; `fragment-list.tsx` is a dumb presentational list — the mutations live in the page).
- [x] "Remove from sequence fails" report: root cause found — the `fragment_positions` cascade dropped placement index rows on discard while the sequence YAML files kept them (see Phase 1 note + `references/suggestions.md`); unplace-before-discard plus these invalidations close it. `placedFragmentsForUnplace` (OverviewPage `hooks/useSectionOps.ts`) derives from the sequence queries, so the prefix invalidation refreshes it — a discarded fragment is no longer offered for unplace.
- [x] Tests: hook-level test that the prefix predicate invalidates exactly the project's sequence family (`useInvalidateSequences.test.tsx`); component-level tests that discard and restore trigger the sequence invalidation (`fragment-editor.test.tsx`).

### Phase 3 — Split partial-failure resilience (backend)

- [ ] Restructure `splitFragmentCommand` so all validation/derivation happens before the first write, and the writes that can still fail afterwards (sequence rewrites, margin migration) are collected as **warnings** instead of failing the whole command: the split result gains a `warnings: string[]` (empty on clean success), returned with 200. Log each warning server-side.
- [ ] Frontend: surface non-empty `warnings` from the split result as a warning toast (split still counts as succeeded; dialog closes, caches refresh).
- [ ] Tests: inject a sequence-write failure after fragment writes → 200 + warning + fragments persisted; margin-migration failure likewise; clean split returns empty warnings. A pre-write validation failure still 400/500s with nothing written.

### Phase 4 — Close out

- [ ] `bun run format` then `bun run verify`; fix all issues.
- [ ] Update `Shipped` frontmatter of the touched specs (`fragment-split.md` for Phase 3; `sequencer.md`/`fragment-model.md` for Phases 1–2).
- [ ] Set plan status, commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Focus: backend discard-unplace composition and the split warning path are the load-bearing changes. The cache-invalidation fix should have at least one regression test so the invalidation isn't silently dropped later.

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When clearly stated to implement, create a new branch based on the plan title, and proceed with development in that branch.

Once a phase, or sensible set of changes, is done, check off the relevant tasks, make a `git commit` and describe what has been added.

When the plan is implemented, fully or partially, set the plan status to `Done`, or `In Progress`. ALSO, update the relevant frontmatter of the relevant specs. Add an item to the `Shipped` frontmatter property with the features implemented. Do not include implementation details or granular tasks.

Do NOT edit `references/TODO.md` — the orchestrator session updates it after review.
