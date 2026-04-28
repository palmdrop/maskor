# Frontend Navigation & Fragment List

**Date**: 27-04-2026
**Status**: Done

---

## Goal

> Reshape the app shell into a persistent-nav layout with proper subroutes, deliver a usable Fragment list view (search, open, discard/restore), and add an unsaved-changes guard on the editor — giving the user a workable frontend for listing, editing, and deleting fragments.

---

## Tasks

### Phase 1 — Route restructuring

- [x] `router.ts`: Remove `projectSearchSchema` and old flat `projectRoute` (with `?fragment=` search param)
- [x] `router.ts`: Remove old flat `fragmentRoute` (`/projects/$projectId/fragment/$fragmentId`)
- [x] `router.ts`: Add layout route for `/projects/$projectId` → `ProjectShellLayout`
- [x] `router.ts`: Add child redirect `/projects/$projectId/` → `fragments`
- [x] `router.ts`: Add child route `/projects/$projectId/fragments` → `FragmentListPage`
- [x] `router.ts`: Add child route `/projects/$projectId/fragments/$fragmentId` → `FragmentPage`
- [x] `router.ts`: Add child routes `/overview` → `OverviewPage`, `/config` → `ProjectConfigPage`
- [x] `FragmentPage.tsx`: Update `from` string to `/projects/$projectId/fragments/$fragmentId`

### Phase 2 — App shell layout

- [x] Create `src/pages/ProjectShellLayout.tsx`: fetch project name via `useGetProject(projectId)`, render persistent sidebar with nav links (Fragments, Overview, Config) using TanStack Router `<Link>`, render `<Outlet />`
- [x] Move `useVaultEvents(projectId)` from `ProjectShellPage.tsx` into `ProjectShellLayout.tsx`
- [x] Delete `ProjectShellPage.tsx`

### Phase 3 — Fragment list page

- [x] Create `src/pages/FragmentListPage.tsx`:
  - Fetch via `useListFragments(projectId)`
  - Text filter input, client-side case-insensitive match on `fragment.title`
  - Per row: title link → `fragments/$id`, readyStatus badge, discarded indicator, Discard/Restore button (calls `useDiscardFragment`/`useRestoreFragment`, invalidates list on success)
  - Active-row highlight when current route matches `fragments/$fragmentId`
  - Empty state when no fragments match filter

### Phase 4 — Unsaved changes guard

- [x] `fragment-editor.tsx`: track `isDirty` state; set on prose/metadata change, clear on successful save
- [x] `FragmentPage.tsx`: use TanStack Router `useBlocker` when `isDirty` is true; expose `isDirty` from editor via ref or callback
- [x] Show `Dialog` (from existing `src/components/ui/dialog.tsx`) when blocker fires: "Discard changes" (unblock, navigate) and "Cancel" (stay)

### Phase 5 — Stub views

- [x] Create `src/pages/OverviewPage.tsx` (heading "Overview" + "Not yet implemented")
- [x] Create `src/pages/ProjectConfigPage.tsx` (heading "Project config" + "Not yet implemented")

### Phase 6 — Keyboard navigation

- [x] Create `src/hooks/useKeyboardNav.ts`: two-key chord (`g` then `f`/`o`/`c`, 500 ms window), navigates to fragments/overview/config; inactive when focus is inside text input, textarea, or contenteditable
- [x] Wire `useKeyboardNav(projectId)` into `ProjectShellLayout.tsx`
- [x] When `isDirty` is true during keyboard nav, Phase 4 router blocker intercepts as normal — no special handling needed

---

## Notes

Keyboard bindings implemented:

| Shortcut | Destination    |
| -------- | -------------- |
| `g f`    | Fragment list  |
| `g o`    | Overview       |
| `g c`    | Project config |

`FragmentListPage` is a layout route (renders list + `<Outlet>`); `FragmentPage` is nested inside it, so the list stays visible alongside the editor (master-detail pattern). Active-row highlight is derived from `useRouterState` pathname regex match.
