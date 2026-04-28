# Review: Frontend navigation

**Date**: 2026-04-28
**Scope**: `packages/frontend`
**Plan**: `references/plans/frontend-navigation.md`
**Spec**: `specifications/navigation.md`

---

## Overall

Implementation matches the plan faithfully. Route tree, master-detail layout, dirty guard, and keyboard nav are all wired correctly. A few real issues worth fixing and some design questions.

---

## Bugs

### 1. `setContent` re-triggers `onUpdate` → false dirty after save

`prose-editor.tsx:70-78` — after a save, `invalidateFragment` triggers a refetch. When the new `content` prop arrives, the `useEffect` calls `editor.commands.setContent(content)`. Tiptap fires `onUpdate` on any `setContent`, which calls `markDirty`. So the sequence is:

```
save → clearDirty() → invalidateFragment() → (async) refetch → setContent → onUpdate → markDirty()
```

The editor will be re-marked dirty immediately after every successful save. This only escapes if tiptap-markdown serializes the content to the exact same string that was saved — a fragile assumption. The fix is to pass `{ emitUpdate: false }` to `setContent`, or to set a ref guard during programmatic updates.

---

### 2. Metadata dirty propagation is one-directional

`fragment-editor.tsx:136-139` — the `onDirtyChange` from `FragmentMetadataForm` only forwards `dirty === true` to `markDirty`. If the user edits a metadata field then reverts it, RHF sets `formState.isDirty = false` and fires `onDirtyChange(false)`, but the editor ignores it. The editor stays dirty until save even if both prose and metadata are actually back to saved state. This causes unnecessary blocker fires on navigation. Either also call `clearDirty` when metadata fires `false` (and check prose state too), or document this as intentional "dirty is one-way until explicit save."

---

## Design

### 3. `FragmentListPage` main area has no empty state

When navigating to `/projects/$projectId/fragments` with no fragment selected, `<Outlet />` renders nothing. The `p-6` padding on `<main>` surrounds an empty box. A "Select a fragment to edit" placeholder would make the intent clear.

### 4. Plan Notes section is stale

`frontend-navigation.md` Notes section still says "`ProjectShellPage.tsx` is left in place (unused) until confirmed safe to delete." But the task checklist marks it deleted, and the diff confirms deletion. The note should be removed.

---

## Minor

### 5. `invalidateList` in `FragmentListPage` not memoized

`FragmentListPage.tsx:28-29` — defined inline without `useCallback`. The rest of the codebase wraps similar callbacks. Low impact since it's only called once per mutation, but inconsistent.

### 6. `g` chord doesn't call `preventDefault` on the first keypress

`useKeyboardNav.ts:24` — when `e.key === "g"` is captured, the event isn't prevented. For focused non-input elements (e.g., a button that scrolls on `g`), the first key could have unintended side effects. Probably fine in practice given the current UI, but worth noting.

---

## Non-issues (for context)

- **`isDirtyRef` pattern in `FragmentPage`** — correct; needed because `shouldBlockFn` runs outside the render cycle.
- **Ref-callback pattern for `onDirtyChange`** — correct; avoids stale closures without adding `useCallback` deps.
- **Active highlight via regex** — works, though `useMatch` from TanStack Router would be more idiomatic. Not broken.
- **`isTextInput` check** — handles `INPUT`, `TEXTAREA`, and `contentEditable`; covers the prose editor correctly.

The post-save dirty re-trigger (#1) is the only thing that will be visibly broken in normal use. Everything else is polish.
