# Spec: Navigation

**Status**: Draft
**Last updated**: 2026-04-27

---

## Outcome

The user can move between the main views of the application without confusion, open a specific fragment from any context where it appears, and receive a prompt for the next fragment to work on when they finish editing one. The application has a clear, consistent shell that frames all views without getting in the way.

---

## Scope

### In scope

- Top-level view structure and which views exist
- Navigation between views (routing model)
- Fragment selection: how the user picks which fragment to open
- Fragment surfacing: how Maskor prompts the user with the next fragment
- Keyboard navigation between views
- Active project context (which project is open)

### Out of scope

- Within-view navigation (e.g. scrolling the overview, moving focus within the fragment editor) — those are owned by the respective view specs
- Project registration and switching (see `project-config.md`)
- The sequence placement algorithm (see `sequencer.md`)
- Export flow (see `export.md`)

---

## Behavior

### Top-level views

The application has four primary views:

| View                | Purpose                                                                | Spec                 |
| ------------------- | ---------------------------------------------------------------------- | -------------------- |
| **Overview**        | Visualise and rearrange the sequence                                   | `overview.md`        |
| **Fragment editor** | Read and edit a single fragment                                        | `fragment-editor.md` |
| **Project config**  | Manage aspects, arcs, interleaving, project metadata                   | `project-config.md`  |
| **Fragment list**   | Browse and filter all fragments; entry point for selecting one to edit | (not yet specced)    |

The shell renders a persistent navigation bar or sidebar with links to Overview, Fragment list, and Project config. The Fragment editor is not a top-level nav destination — it opens when the user selects a fragment.

### Routing model

- Routes are client-side (React Router or equivalent).
- The active project UUID is part of the route context. All views operate within the context of one project.
- Navigating away from the Fragment editor with unsaved changes prompts the user to save or discard before leaving.
- Deep links to a specific fragment (`/fragments/:uuid`) are supported — the Fragment editor opens with that fragment loaded.

### Fragment selection

The user can open a fragment in the editor from:

- The **Fragment list** view (the primary browsing surface).
- A **tile in the Overview** — clicking a fragment tile opens it in the editor.
- A **prompt** surfaced by Maskor after finishing work on a fragment (see below).

The Fragment editor does not decide which fragment to show. It receives a fragment UUID from the caller (the routing layer). Fragment navigation within the editor (prev/next) is an optional convenience shortcut; the ordering is not defined yet.

### Fragment surfacing (prompting mechanism)

Fragment prompting is a first-class feature of Maskor. See `prompting.md` for the full spec.

In brief: after saving a fragment and navigating away, Maskor surfaces a non-deterministic suggestion for the next fragment to work on. The user can accept, request a different suggestion, or dismiss. The prompt is non-blocking. The mechanism is togglable per project.

### Keyboard navigation

- A global keyboard shortcut opens the Fragment list.
- A global keyboard shortcut opens the Overview.
- A global keyboard shortcut opens Project config.
- Within the Fragment editor, a shortcut switches focus between the prose editor and the metadata sidebar (see `fragment-editor.md` open questions).
- Exact key bindings are not defined yet — they are an open question.

---

## Constraints

- The active project must be set before any view is usable. If no project is open, the user is shown a project selection screen.
- The Fragment editor is always opened with a specific fragment UUID. There is no "empty" editor state.
- Navigating away from unsaved changes must always prompt the user — no silent discard.

---

## Open questions

- [ ] 2026-04-27 — What is the Fragment list view? A simple list with search/filter? A grid? Does it exist as a separate route or is it a panel within the Overview? This needs its own spec before the navigation layer can be fully implemented.
- [ ] 2026-04-27 — What keyboard shortcuts are assigned to each global navigation action?
- [ ] 2026-04-27 — Prompting mechanism open questions are tracked in `prompting.md`.
- [ ] 2026-04-27 — Does fragment prev/next navigation within the editor follow sequence order, list order, or recency? Should it exist at all?
- [x] 2026-04-27 — Where does the user switch between open projects? **Resolved**: The project name in the sidebar links to `/` (the project management screen). No separate picker needed.

---

## Acceptance criteria

- The shell renders a persistent navigation bar with links to Overview, Fragment list, and Project config.
- Clicking a fragment tile in the Overview opens the Fragment editor with that fragment loaded.
- Navigating away from the Fragment editor with unsaved changes triggers a save/discard prompt.
- After saving a fragment, Maskor presents a prompt suggesting a next fragment from the eligible pool. The user can accept or dismiss.
- The suggested fragment is not one of the most recently opened fragments (cooldown applies).
- A fragment with `readyStatus === 1.0` is not surfaced by the prompting mechanism.
- Deep-linking to `/fragments/:uuid` opens the Fragment editor with the correct fragment.
