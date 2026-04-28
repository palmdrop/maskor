# Project Switching and Selection View

**Date**: 28-04-2026
**Status**: Done

---

## Goal

> Give the user a full project management screen (list, register, deregister) reachable from within the project shell, so they never need the API to manage projects.

---

## Tasks

### Phase 1 — Navigation entry point

- [x] `ProjectShellLayout.tsx`: Wrap the project name `<p>` in a `<Link to="/">` so the user can leave the active project shell and reach the project management screen. Style it as a subtle link (no underline, inherit muted color, hover state).
- [x] `navigation.md`: Resolve the open question "Where does the user switch between open projects?" — decision: project name in sidebar links to `/` (the project management screen).

### Phase 2 — Project management page

- [x] `ProjectSelectionPage.tsx`: Refactor from a bare list into a full management view:
  - Render each registered project as a row/card showing: name and vault path.
  - "Open" button per row — navigates to `/projects/$projectId`.
  - "Deregister" button per row — triggers `useDeleteProject`, invalidates `getListProjectsQueryKey()` on success.
  - Guard deregister with a `Dialog` confirmation (reuse `src/components/ui/dialog.tsx`): warn that the registry entry is removed but vault files are untouched (matches spec behavior).

### Phase 3 — Project registration form

- [x] `ProjectSelectionPage.tsx`: Add a "Register project" section with two controlled inputs: `name` (text) and `vaultPath` (text, labelled "Vault path").
- [x] Submit via `useCreateProject`; on success: invalidate `getListProjectsQueryKey()` and clear the form.
- [x] Surface backend errors inline below the form (e.g. vault path does not exist, duplicate vault path).
- [x] Disable submit while the mutation is pending.

### Phase 4 — Empty state

- [x] When `projects.length === 0`: render the registration form prominently with a short description ("No projects registered. Point Maskor at a vault to get started.") instead of showing a separate empty-state message.
- [x] When projects exist, render the registration form below the project list (collapsed or as a secondary section — exact UX is open, use judgment at implementation time).

### Phase 5 — Remove auto-redirect

- [x] `router.ts` index loader: remove the single-project auto-redirect. The user always lands on the project management screen when navigating to `/`. The management screen handles the 1-project case gracefully (one row + "Open" button).
  - Future intent: auto-redirect to the user's _latest active project_ once that concept is tracked. That is a separate feature and not in scope here.

---

## Notes

- No rename (update) flow is included. The API has `ProjectUpdateSchema` but no route is exposed yet (noted in `project-config.md` prior decisions). Out of scope here.
- `vaultPath` uniqueness and existence are enforced by the backend; the frontend only needs to surface the error clearly.
- The `Dialog` confirmation component is already present (`src/components/ui/dialog.tsx`).
- Keyboard navigation: no new shortcuts are needed. `g c` (Config) and the project-name link are sufficient.
