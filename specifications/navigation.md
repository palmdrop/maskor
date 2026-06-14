# Spec: Navigation

**Status**: Stable
**Last updated**: 2026-06-14

**Shipped**:

- 2026-04-20 — Project selection screen at `/`; the project shell requires an active project — no view is accessible without one. (plan: references/plans/project-switching-view.md)
- 2026-04-27 — Application shell renders a persistent navigation bar scoped to the active project, with links to Fragment list, Overview, and Project config. (plan: references/plans/frontend-navigation.md)
- 2026-04-27 — Fragment list view is available: users can browse, search, and open any fragment into the editor from a dedicated route. (plan: references/plans/frontend-navigation.md)
- 2026-05-19 — Unsaved fragment-editor edits survive leaving the editor via the swap/recovery model (`useEntityContentSwap`): the in-progress buffer is restored when the fragment is reopened. The overlay editor's Close is a save-then-close ("Done"). This supersedes the originally-planned 2026-04-27 "save/discard prompt on leave", which was never built — recovery (nothing lost) was adopted instead of a blocking prompt. (plan: references/plans/frontend-navigation.md)
- 2026-06-05 — TODO Triage — small bug fixes and minor editor features triaged from references/TODO.md: suggestion-mode state, editor save round-trip, margin alignment, aspect picker, auto-typography, vim clipboard toggle. (plan: scripts/ralph/archive/2026-06-05-todo-triage-fixes/)
- 2026-05-20 — Chord-based keyboard shortcuts (`g+f`, `g+o`, `g+c`) removed; replaced by command-palette navigation commands accessible via `Cmd/Ctrl+K`. (plan: references/plans/command-palette.md)
- 2026-06-09 — View-state restoration: re-entering Fragments via navbar or command restores the last-opened fragment; Overview restores selected sequence, scroll position, and fragment selection; Preview restores selected sequence and scroll position. State persists across reloads via per-project localStorage. Stale references (deleted fragments/sequences/selections) are cleared or filtered on restore. (plan: references/plans/view-state-restoration.md)
- 2026-06-11 — In-editor Previous/Next navigation exists and its ordering is view-supplied: list order in the fragment list, sequence order in Overview, assembled order in Preview, and the prompting selection in suggestion mode. The editor renders the controls; the mounting view owns the ordering and the save-then-advance. Resolves the 2026-04-27 open question. (plan: references/plans/fragment-editor-focus-mode.md)

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
- Leaving the Fragment editor with unsaved changes does not prompt. The dedicated editor unmounts on leave and the swap/recovery model (`useEntityContentSwap`) restores the in-progress buffer when the fragment is reopened, so nothing is lost. The overlay editor saves before closing ("Done").
- Deep links to a specific fragment (`/fragments/:uuid`) are supported — the Fragment editor opens with that fragment loaded.

### Fragment selection

The user can open a fragment in the editor from:

- The **Fragment list** view (the primary browsing surface).
- A **fragment in the Overview** — clicking a fragment (its prose block or condensed title row) opens it in the editor.
- A **prompt** surfaced by Maskor after finishing work on a fragment (see below).

The Fragment editor does not decide which fragment to show. It receives a fragment UUID from the caller (the routing layer). Fragment navigation within the editor (prev/next) is an optional convenience shortcut; the ordering is not defined yet.

### Fragment surfacing (prompting mechanism)

Fragment prompting is a first-class feature of Maskor. See `prompting.md` for the full spec.

In brief: after saving a fragment and navigating away, Maskor surfaces a non-deterministic suggestion for the next fragment to work on. The user can accept, request a different suggestion, or dismiss. The prompt is non-blocking. The mechanism is togglable per project.

### Keyboard navigation

Keyboard-driven navigation is owned by the command system. See `command-palette.md` — every navigation destination is a registered command with an optional hotkey, surfaced both in the palette (`Cmd/Ctrl+K`) and via direct hotkey binding.

- A global hotkey opens the Fragment list.
- A global hotkey opens the Overview.
- A global hotkey opens Project config.
- Within the Fragment editor, a shortcut switches focus between the prose editor and the metadata sidebar (see `fragment-editor.md` open questions).
- The existing chord-based prefix shortcuts (`g+f`, `g+o`, `g+c`) shipped 2026-04-27 are legacy and will be replaced by command-bound hotkeys. The final scheme (modifier-prefixed vs unmodified single letters) is tracked in `command-palette.md`.

---

## Constraints

- The active project must be set before any view is usable. If no project is open, the user is shown a project selection screen.
- The Fragment editor is always opened with a specific fragment UUID. There is no "empty" editor state.
- Leaving the editor with unsaved changes must never silently lose work. This is guaranteed by the swap/recovery model (the buffer is restored on reopen), not by a save/discard prompt.

---

## Open questions

- [ ] 2026-04-27 — What is the Fragment list view? A simple list with search/filter? A grid? Does it exist as a separate route or is it a panel within the Overview? This needs its own spec before the navigation layer can be fully implemented.
- [x] 2026-04-27 — What keyboard shortcuts are assigned to each global navigation action? **Resolved 2026-05-19**: ownership moved to `command-palette.md`. Nav actions are commands; their hotkeys are declared on the command definitions. The exact post-chord scheme remains an open question there.
- [ ] 2026-04-27 — Prompting mechanism open questions are tracked in `prompting.md`.
- [x] 2026-04-27 — Does fragment prev/next navigation within the editor follow sequence order, list order, or recency? Should it exist at all? **Resolved 2026-06-11**: it exists and is view-supplied — list order, sequence order, assembled order, or the prompting selection, per the mounting view. The editor renders the controls; the view owns the ordering. See `fragment-editor.md`.
- [x] 2026-04-27 — Where does the user switch between open projects? **Resolved**: The project name in the sidebar links to `/` (the project management screen). No separate picker needed.

---

## Acceptance criteria

- The shell renders a persistent navigation bar with links to Overview, Fragment list, and Project config.
- Clicking a fragment in the Overview opens the Fragment editor with that fragment loaded.
- Leaving the Fragment editor with unsaved changes loses no work: reopening the fragment restores the in-progress buffer (swap/recovery model); the overlay editor saves on Close.
- After saving a fragment, Maskor presents a prompt suggesting a next fragment from the eligible pool. The user can accept or dismiss.
- The suggested fragment is not one of the most recently opened fragments (cooldown applies).
- A fragment with `readyStatus === 1.0` is not surfaced by the prompting mechanism.
- Deep-linking to `/fragments/:uuid` opens the Fragment editor with the correct fragment.
