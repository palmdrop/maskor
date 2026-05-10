# Review: Editor Typography Settings

**Date**: 2026-05-10
**Scope**: `packages/frontend`, `packages/shared`, `packages/storage`
**Plan**: `references/plans/editor-typography-settings.md`
**Spec**: `specifications/fragment-editor.md`

---

## Overall

Typography settings (font size, paragraph width) are wired correctly from schema through storage to the UI. The core feature is sound. The `SuggestionModePage` layout refactor (collapsing action bars into the shell, removing the `⌘↵` hint) is intentional. Two bugs remain: the `saveError` indicator will never render due to a missing memo dep, and the discard/restore button can show stale state for the same reason.

---

## Bugs

### 1. `saveError` in SuggestionModePage never renders

`packages/frontend/src/components/fragments/fragment-editor.tsx:175`

The `useMemo` for `extraActions` only lists `[isUpdatePending, isDiscardPending, isRestorePending]` as deps. `customizeExtraActions` is not in the array. When `SuggestionModePage` sets `saveError`, it re-renders with a new `customizeExtraActions` function that captures the updated JSX. `FragmentEditor` receives new props and re-renders, but because none of the memo deps changed, the stale cached `extraActions` is returned. The error is never shown.

```
saveError changes → customizeExtraActions is new ref
→ FragmentEditor re-renders
→ useMemo deps unchanged → cached value returned
→ saveError content suppressed
```

Note: the saveError markup is an inline flex fragment — that fits within the shell's action row. The layout itself is fine once the memo dep is fixed.

Fix: add `customizeExtraActions` to the `useMemo` dep array.

### 2. Discard/Restore button shows stale state

`packages/frontend/src/components/fragments/fragment-editor.tsx:156–175`

`fragment?.isDiscarded`, `handleRestore`, and `handleDiscard` are all referenced inside the memo but absent from the dep array. After a discard succeeds: `isDiscardPending` flips to `false` (memo re-runs), but the fragment query re-fetch is async. By the time `fragment.isDiscarded` becomes `true`, `isDiscardPending` has already settled and no dep has changed — the memo stays cached. The button keeps showing "Discard" with the discard handler instead of switching to "Restore".

Fix: add `fragment?.isDiscarded`, `handleRestore`, `handleDiscard`, and `customizeExtraActions` to the dep array.

---

## Minor

### 3. `max-w-none` still on TipTap editor class

`packages/frontend/src/components/prose-editor.tsx:76`

The plan's notes said to remove `max-w-none` once the outer wrapper took over width constraining. It's still there. Harmless in practice (the outer div's `maxWidth` wins), but contradicts the plan and could confuse a future reader.

---

## Non-issues

- **`value!` on slider destructuring** — `Slider` always provides a value; the assertion is safe.
- **`localReadyStatusThreshold` local state added** — good opportunistic fix making the existing slider consistent with the new ones (live feedback during drag).
- **`isActionPending` not in memo deps** — it's derived from the three deps that ARE listed, so `disabled` state is always current.
