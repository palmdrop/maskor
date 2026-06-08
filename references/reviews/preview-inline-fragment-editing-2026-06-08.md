# Review: Preview inline fragment editing

**Date**: 2026-06-08
**Scope**: `packages/frontend/src/components/inline-fragment-editor.tsx`, `packages/frontend/src/lib/preview/split-around-fragment.ts`, `packages/frontend/src/pages/PreviewPage/PreviewPage.tsx`, `packages/frontend/src/pages/OverviewPage/components/`
**Plan**: `references/plans/preview-inline-fragment-editing.md`
**Spec**: `specifications/preview.md`, `specifications/sequencer.md`

---

## Overall

Implementation matches the plan faithfully across all five phases. The triptych split (ReadonlyProse / InlineFragmentEditor / ReadonlyProse), double-click resolution, margin-anchor round-trip, observer cleanup fix, and spec updates are all correct. Four minor issues to fix before merge: one coding-standards violation in production code, one missed `useMemo`, one abbreviated test alias, and a missing re-scroll test that the plan explicitly called a key risk area.

---

## Bugs

None.

---

## Design

### 1. `editSplit` not memoized — recomputes on every render while editing

`PreviewPage.tsx:262` — `splitAroundFragment` (indexOf + slice on the full assembled markdown string) runs on every render of `PreviewPage` while `editingFragmentUuid` is set. State updates in the parent (sidebar hover, toolbar toggles, etc.) trigger it repeatedly.

Fix: wrap in `useMemo([assembled?.markdown, editingFragmentUuid])`. The plan notes novel-scale cost; memoizing it costs nothing and removes the pathological case.

---

## Minor

### 2. `splitAroundFragment` is a `function` declaration, not an arrow function

`split-around-fragment.ts:12` — coding standard requires arrow functions. Should be:

```ts
export const splitAroundFragment = (
  markdown: string,
  uuid: string,
): { before: string; after: string } | null => { ... };
```

### 3. Abbreviated alias `sent` in test

`split-around-fragment.test.ts:5` — `const sent = anchorSentinel;` violates the no-abbreviation rule. Rename to `const sentinel = anchorSentinel;` (or just call `anchorSentinel(...)` directly).

### 4. Re-scroll after save is not tested

The plan explicitly listed "save → invalidate → re-scroll" as a key risk area. The `PreviewPage — inline editing` suite tests the save call and cancel, but has no test verifying that `pendingScrollUuid` is set after save and that `scrollIntoView` is called on the correct anchor element. This is the one plan risk area left uncovered.

---

## Non-issues

- **`handleKeyDown` not `useCallback` while `handleSave` is** — `handleKeyDown` closes over `handleSave` (already stable) and `onCancel` (external prop). Not memoizing it is fine; the only consumer is the `onKeyDown` prop of a plain `<div>`, which doesn't memo-compare.
- **`editingFragment!` non-null assertion at `PreviewPage.tsx:321`** — safe: the assertion is behind `editSplit ? (...)` which is only truthy when `editingFragment` is non-null (the `editSplit` guard is `editingFragmentUuid && editingFragment`).
- **Observer re-created on every `assembled` change** — dependency array `[previewReady, assembled, editingFragmentUuid]` causes the IntersectionObserver to disconnect and re-observe after each refetch. Brief gap is acceptable; the cleanup preventing the pre-existing observer leak is the important fix here.
- **`ANCHOR_SENTINEL_PATTERN.exec()` called without resetting `lastIndex`** — pattern has no `g` flag so `lastIndex` is not tracked; each call to `splitAroundFragment` is independent. Correct.
- **`handleSave` fallback `?? content`** — falls back to the initial prop if the editor ref is somehow null at save time. The ref can only be null if ProseEditor unmounts while InlineFragmentEditor is still mounted, which cannot happen. The fallback is unreachable in practice.
- **Multiple fragments simultaneously editable in Overview** — each `FragmentProse` has its own `isEditing` state, so two fragments could be open at once. The plan's "one editor at a time" requirement was scoped to Phase 3 (Preview), which uses global `editingFragmentUuid` state. Overview's per-fragment state is consistent with the existing pre-PR behavior.
