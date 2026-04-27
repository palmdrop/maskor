# Frontend Navigation & Fragment List

**Date**: 27-04-2026
**Status**: Todo

---

## Goal

> Reshape the app shell into a persistent-nav layout with proper subroutes, deliver a usable Fragment list view (search, open, discard/restore), and add an unsaved-changes guard on the editor — giving the user a workable frontend for listing, editing, and deleting fragments.

---

## Phases

### Phase 1 — Route restructuring

Convert the current flat route tree into a nested layout tree.

New route tree:

```
/                                        → ProjectSelectionPage (unchanged)
/projects/$projectId                     → ProjectShellLayout  (layout, renders nav + <Outlet>)
  /projects/$projectId/                  → redirect to /fragments
  /projects/$projectId/fragments         → FragmentListPage
  /projects/$projectId/fragments/$id     → FragmentPage  (replaces /projects/$projectId/fragment/$fragmentId)
  /projects/$projectId/overview          → OverviewPage  (stub)
  /projects/$projectId/config            → ProjectConfigPage  (stub)
```

Changes:
- Update `router.ts`: add layout route for `/projects/$projectId`, add child routes for `fragments`, `fragments/$id`, `overview`, `config`.
- Remove the old flat `fragmentRoute` (`/projects/$projectId/fragment/$fragmentId`). Add a redirect from the old path to the new one so any existing deep links still work.
- Remove `?fragment=` query param from `ProjectShellPage` — fragment selection is now a real subroute.
- The `projectRoute` search schema (`projectSearchSchema`) can be removed.

### Phase 2 — App shell layout component

Create `packages/frontend/src/pages/ProjectShellLayout.tsx`:

- Fetch project name via `useGetProject(projectId)` (already in generated hooks).
- Render a persistent left sidebar (or top bar — keep it minimal) with:
  - Project name / logo area at the top.
  - Nav links: **Fragments**, **Overview**, **Config**.
  - Use TanStack Router `<Link>` with active-state styling (`[data-status=active]` or `isActive`).
- Render `<Outlet />` for child views.
- Replace current `ProjectShellPage` with this layout; delete or archive the old file.

### Phase 3 — Fragment list page

Create `packages/frontend/src/pages/FragmentListPage.tsx`:

- Fetch fragments via `useListFragments(projectId)` (already generated).
- Local state: `filter` string (text input above the list).
- Filter fragments client-side: case-insensitive match on `fragment.title`.
- For each fragment render a row with:
  - Title (clickable → navigate to `fragments/$id`).
  - `readyStatus` as a percentage badge.
  - "Discarded" indicator when `isDiscarded`.
  - Discard / Restore button (inline; calls `useDiscardFragment` / `useRestoreFragment`, invalidates list on success).
- Selected row highlights when the current route matches `fragments/$id`.
- Empty state when no fragments match the filter.
- Reuse `useVaultEvents(projectId)` to keep the list live (currently lives in `ProjectShellPage` — move it to the layout or the list page).

Retire `fragment-detail.tsx` and the `FragmentDetail` usage inside the old `ProjectShellPage` — the list page now navigates to the full editor rather than showing an inline detail panel.

### Phase 4 — Unsaved changes guard

Wire a navigation block on `FragmentPage` / `FragmentEditor`:

- Track dirty state in `FragmentEditor`: set `isDirty = true` whenever the prose editor content or metadata form diverges from the last-saved values; reset to `false` on successful save.
- Use TanStack Router's `useBlocker` hook (available in v1) to intercept navigation away from the fragment route when `isDirty` is true.
- Show a confirm dialog (reuse `Dialog` from shadcn/ui): "You have unsaved changes. Save or discard before leaving." Two actions: **Discard changes** (unblock, navigate) and **Cancel** (stay).
- No silent discard — the constraint from the spec.

### Phase 5 — Stub views

Create minimal placeholder pages:

- `packages/frontend/src/pages/OverviewPage.tsx` — renders a heading "Overview" and a short note "Not yet implemented."
- `packages/frontend/src/pages/ProjectConfigPage.tsx` — renders a heading "Project config" and a note "Not yet implemented."

Both pages are real routes in the nav; clicking them navigates correctly.

### Phase 6 — Keyboard navigation

Add global keyboard shortcuts for switching between top-level views. Bindings are an open question in the spec — pick reasonable defaults and note them as provisional:

| Shortcut | Destination     |
| -------- | --------------- |
| `g f`    | Fragment list   |
| `g o`    | Overview        |
| `g c`    | Project config  |

Implementation:
- Add a `useKeyboardNav(projectId)` hook (or inline in the layout) that listens for `keydown` events on `document`.
- Use a two-key chord approach (`g` followed by `f`/`o`/`c`) via a short-lived timeout (500 ms) between the two keys.
- When a navigation is triggered from inside the Fragment editor and `isDirty` is true, let the router blocker (Phase 4) intercept as normal.
- Shortcuts are inactive when focus is inside a text input, textarea, or contenteditable element.
