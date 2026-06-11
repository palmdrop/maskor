# Review: Frontend Architecture Refactor — Rollout (all four plans)

**Date**: 2026-06-11
**Scope**: `packages/frontend` (+ a pre-existing `packages/api` export fix folded in)
**Plan**: `references/plans/_frontend-architecture-rollout.md` and its four linked plans
**Spec**: `specifications/project-config.md`, `specifications/overview.md` (no `shipped` change — pure refactors)

---

## Overall

Strong, disciplined refactor. All four plans landed as described, every claimed seam exists and is exercised by its own unit tests, and `bun run verify` is green repo-wide (946 backend + 694 frontend, typecheck + lint clean). The behavior-preservation claim holds up under inspection: I traced the highest-risk migrations (FragmentEditor's coupled content save, the metadata-form optimistic merge, the GeneralTab vim↔raw coupling, the prose-editor handle selection, the section-op guards) and each reproduces the original semantics. No bugs found.

The headline win is real: the four hot files all shrank (OverviewPage 824→654, prose-editor 602→430, EntityEditorShell 668→453, GeneralTab 439→351, useSequenceMutations 269→153) and — more importantly — the cache/mutation machinery that was copy-pasted across ~13 call sites now lives in one tested primitive. Tests moved _down_ to the extracted interfaces (the primitive, the setting hook, the selection/section-op hooks, the two adapters) instead of being re-proven by mounting whole pages, which is exactly what the plans set out to do.

Findings below are all minor. The three Minor items (#2 stale comment, #3 `s` abbreviation, #4 duplicate `useEntityEditor` instance) have since been fixed; #1 is the one open note (OverviewPage landed at 654 lines, not the plan's "~300" — a stale target, not a defect).

---

## Bugs

None.

I specifically checked the failure modes a refactor like this tends to introduce, and they're all handled:

- **Optimistic rollback** still fires correctly — the primitive's `onError` restores the snapshot, and `customFetch`'s throw-on-non-2xx contract means `onError` fires precisely when the request fails (proven by `useOptimisticMutation.test.tsx` rollback case).
- **The metadata-form merge collapse is genuinely equivalent.** The plan replaced `makeSave(applyToFragment, patch)` with a raw `apply` that merges `variables.data`. On `main`, the two functions passed to `makeSave` were already identical for all three fields (`(_, value) => ({ readiness: value })` vs `(value) => ({ readiness: value })`), so the optimistic cache write is byte-for-byte the same patch it was before.
- **FragmentEditor's coupled save** preserves the `isProseDirty` gate, the Margin flush, and the swap-clear ordering; `onSaved` still resets `isProseDirty`, after which the `fragment.content` effect resyncs `fragmentContent` from the reconciled server entity.
- **vim↔raw coupling** is preserved exactly: raw renders checked as `rawMarkdownMode.value || vimMode.value` and is disabled while vim is on, and (matching `main`) toggling vim writes only `editor.vimMode`, never `rawMarkdownMode`.
- **Section-op guards** (`canSplitBefore/After`, mergeable-up drops first / mergeable-down drops last, merge-up targets predecessor) match the documented semantics and are covered at the hook level.

---

## Design

### 1. OverviewPage reached 654 lines, not the plan's "~300"

`packages/frontend/src/pages/OverviewPage/index.tsx` — the `overview-surface-hooks` goal line stated the page should drop "from 824 toward ~300 lines." It landed at 654. This is not a defect — the plan's own scope section deliberately left keyboard-move and the arc/detail toggles inline, and the two targeted clusters (selection, section-ops) _were_ fully extracted and tested. But the "~300" figure in the goal is now misleading. Consequence: none functionally; flag it so the number isn't read later as an unmet commitment. The remaining bulk is the `overviewScope` provider assembly (30 fields) and the still-inline keyboard-move cluster, both explicitly deferred.

---

## Minor

### 2. Stale duplicate comment block in `prose-editor.tsx` — **[FIXED 2026-06-11]**

`packages/frontend/src/components/prose-editor.tsx:345-348` — two adjacent comment blocks describe the adapters; the first ("The CodeMirror (vim + raw) backend behind the handle. Stable: …") is a leftover from the Phase-1 single-adapter state and is now contradicted by the second block ("The two backends behind the handle …"). Delete the first block. **Fixed:** stale block removed.

### 3. Abbreviated `s` parameter in the new `useSectionOps` — **[FIXED 2026-06-11]**

`packages/frontend/src/pages/OverviewPage/hooks/useSectionOps.ts:65,109,140,154` — `sectionsData.find((s) => …)` / `findIndex((s) => …)`. `CODING_STANDARDS.md` requires full names even in callbacks (`section`, not `s`), and the same file already uses `(section)` elsewhere (lines 121, 128, 134), so it's internally inconsistent. New code in this rollout; worth normalizing. **Fixed:** all four renamed to `section`.

### 4. `useEntityEditor` is mounted twice per fragment route — **[FIXED 2026-06-11]**

`packages/frontend/src/components/fragments/fragment-metadata-form.tsx:50` calls `useEntityEditor("fragment", …)` purely for `makeFieldSave`, while `FragmentEditor` already holds its own instance. That means two `useGetFragment` subscriptions (deduped by React Query — one network fetch) and four `useUpdateFragment` instances for one screen. Functionally fine and arguably the cleanest call shape, but the hook does more than the form needs. **Fixed (option C):** extracted `useEntityFieldSave` — a slim hook that owns one optimistic field-update instance and `makeFieldSave`, with no entity GET and no content/key mutation. The shared optimistic-config and input builders (`buildEntityOptimisticConfig`, `buildEntityInput`) moved beside it as pure functions; `useEntityEditor` now composes `useEntityFieldSave` for its field half. The metadata form points at the slim hook, dropping the redundant GET subscription and the unused content mutation. The form keeps its standalone testability (no prop coupling to the parent), so its tests were untouched. Behavior unchanged — full suite green (694).

---

## Non-issues

- **`unwrap` ignores `status` at runtime** (`src/api/unwrap.ts`) — intentional. It trusts the `customFetch` throw-on-non-2xx contract; the type narrows to the 200 `data` and the comment documents why the old per-call `status !== 200` throws were unreachable dead code (and would have stripped the correlation id). Correct to delete them rather than consolidate.
- **`onError` rollback is guarded by `context?.snapshot !== undefined`** (`useOptimisticMutation.ts:67`) — when there was no prior cache entry the snapshot is `undefined` and rollback is skipped, but the reducers return `previous` (undefined) when the cache is empty, so there is nothing to roll back to. No stale optimistic value persists.
- **`optimisticConfig` rebuilt every render in `useEntityEditor`** — not memoized, but react-query reads `onMutate`/`onError`/`onSuccess` at mutate time and all inputs derive from stable props/`queryClient`. No stale-closure or churn issue.
- **Adapters call `setHighlightedAnchor` as a no-op in TipTap** (`prose-editor-tiptap-adapter.ts:130`) — matches `main`; highlight is a vim/raw-only cue. Documented.
- **`// NOTE: The assignment is not useless, ts is wrong?` + `eslint-disable no-useless-assignment`** in `useEntityInsertExtract.ts:187-188` — carried over verbatim from the original `EntityEditorShell`, not introduced here. (Still slightly smelly — the `let result = null` could be avoided by assigning the `try` result directly — but it's a faithful move, out of this rollout's no-behavior-change scope.)
- **Per-setting `useUpdateProject` instances in GeneralTab** — each `useProjectSetting` owns its own mutation, so a control now disables only during _its own_ save rather than (as on `main`) every control disabling on any pending project save. This is an incidental UX improvement, not a regression, and the immediate/draft local value keeps the row feeling instant regardless.
