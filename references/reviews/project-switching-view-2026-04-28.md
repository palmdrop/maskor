# Review: Project Switching View

**Date**: 2026-04-28
**Scope**: `packages/frontend/src/pages/ProjectSelectionPage.tsx`, `ProjectShellLayout.tsx`, `router.ts`, `prose-editor.tsx`
**Plan**: `references/plans/project-switching-view.md`
**Spec**: `specifications/navigation.md`

---

## Overall

Implementation matches the plan exactly — all five phases are complete. The management screen is functional and the UX decisions (sidebar link, inline registration form, deregister confirmation) are sound. Two error-handling gaps would leave the user with no feedback if a mutation fails at the network layer.

---

## Bugs

### 1. `RegisterForm`: no catch for thrown mutation errors

`ProjectSelectionPage.tsx:35` — `createProject.mutateAsync` is awaited without a `try/catch`. If the call throws (network error, unexpected rejection), execution never reaches the `else` branch, `error` state stays `null`, and the user sees no feedback. The button re-enables (`isPending` resets) but the form looks idle.

```
mutateAsync throws → setError never called → user sees nothing
```

Fix: wrap the `await` in a `try/catch` and call `setError` in the catch block.

### 2. `DeregisterDialog`: no error handling at all

`ProjectSelectionPage.tsx:85` — `handleDeregister` has no `try/catch` and no result check. If the delete mutation fails, the dialog stays open, the button re-enables, and the error propagates as an unhandled rejection with no user feedback.

Fix: same as above — `try/catch` around `mutateAsync`, show an error message inside the dialog on failure.

---

## Design

### 3. `onSuccess` is always a no-op

`ProjectSelectionPage.tsx:148, 162, 177` — Both `RegisterForm` and `DeregisterDialog` accept an `onSuccess` prop, but every call site passes `() => {}`. The prop is dead code in its current form. Either remove it (both components can handle their own post-success state) or wire it up if there's real intent (e.g., auto-navigating when the last project is deregistered).

---

## Minor

### 4. Test fixture timestamp bumped

`packages/test-fixtures/basic-vault/fragments/late-winter.md:6` — `updatedAt` was changed from `2026-04-27T23:10:16.596Z` to `2026-04-28T08:23:38.046Z`. Looks like an incidental artifact of running the app. If any test asserts this exact value, it will fail. Restore or update any affected fixture snapshots intentionally.

---

## Non-issues

- **`redirect` import in `router.ts`** — still used at line 38 by `projectShellIndexRoute`. Not orphaned.
- **`setContent(content, { emitUpdate: false })`** — TipTap API changed the second parameter from a boolean to an options object. The change in `prose-editor.tsx` is a correct API compatibility fix.
- **No auto-redirect at `/`** — the loader removal is intentional per plan Phase 5. The single-project case is handled by the list view itself.
- **Query invalidation inside handlers** — calling `queryClient.invalidateQueries` directly in mutation handlers rather than via `onSuccess` callbacks is consistent with the existing codebase pattern.
