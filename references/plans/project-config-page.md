# Project Config Page

**Date**: 28-04-2026
**Status**: In progress

---

## Goal

The ProjectConfigPage is fully implemented: project name is editable, aspects can be created/renamed/deleted, notes and references can be created/deleted, and arcs can be authored per aspect via a curve editor.

---

## Tasks

### Phase 1: Page layout

- [x] Implement tabbed layout for ProjectConfigPage (tabs: General, Aspects, Notes, References)
- [x] Load current project data via `useGetProject` and pass down to sections

### Phase 2: General tab — project metadata

- [x] Add `PATCH /projects/:projectId` API route using existing `ProjectUpdateSchema` (name only)
- [x] Add `updateProject(uuid, patch)` method to project registry in storage
- [x] Regenerate orval client after route addition
- [x] Implement inline-edit for project name in General tab (edit-in-place pattern: click to edit, enter/blur to save)
- [x] Display vault path as read-only field in General tab

### Phase 3: Notes and References tabs

Notes and references share an identical structural pattern. Implement them in parallel.

- [ ] Notes tab: list existing notes (titles only) via `useListNotes`
- [ ] Notes tab: create note with title + optional initial body via dialog → `useCreateNote`
- [ ] Notes tab: delete note → `useDeleteNote`; no warning needed unless future "warn if attached" is added
- [ ] References tab: list existing references (names only) via `useListReferences`
- [ ] References tab: create reference with name + optional initial body via dialog → `useCreateReference`
- [ ] References tab: delete reference → `useDeleteReference`
- [ ] Extract shared `AttachableEntityPanel` component reused by both tabs (list + create dialog + delete button)
- [ ] Note: body editing is out of scope for config page; body belongs in a dedicated editor or directly in vault

### Phase 4: Aspects tab — CRUD

- [ ] Aspects tab: list existing aspects via `useListAspects` (show key + optional category)
- [ ] Aspects tab: create aspect with key + optional category + optional description → `useCreateAspect`
- [ ] Aspects tab: delete aspect → `useDeleteAspect` with confirmation dialog

Rename is a backend-only concern tracked separately in Phase 6. The frontend shows the key as read-only text for now. No UI work is blocked on Phase 6.

### Phase 6: Aspect rename (backend only, deferrable)

Rename is isolated to the storage and API layers. The frontend does not need to be touched until this is done, and Phases 1–5 can ship without it.

- [ ] Add `PATCH /aspects/:aspectId` API route using existing `AspectUpdateSchema`
- [ ] Implement rename in storage service: write new vault file with updated key + old UUID, delete old file, inline-update DB row
- [ ] When the key changes, scan fragment DB rows for orphaned weights and include a `warnings` array in the response listing affected fragment UUIDs
- [ ] Regenerate orval client after route addition
- [ ] Once route exists, add inline rename to Aspects tab UI with key-drift warning surfaced from the response

### Phase 5: Arc editor (per aspect)

Arcs are vault-stored at `<vault>/.maskor/config/arcs/<aspect-key>.yaml`. They are NOT watcher-indexed — read and written directly on demand.

**Storage layer:**

- [ ] Implement arc vault methods: `readArc(context, aspectKey): Arc | null`, `writeArc(context, arc): void`, `deleteArc(context, aspectKey): void`
- [ ] Arc file format: YAML with `uuid`, `aspectKey`, and `points` (array of `{x, y}`)
- [ ] No DB indexing for arcs (consistent with watcher ignoring `.maskor/`)

**API layer:**

- [ ] Add arc routes under `/projects/:projectId/aspects/:aspectId`:
  - `GET  /arc` — returns the arc or 404 if none
  - `PUT  /arc` — creates or replaces the arc (idempotent); body is `ArcCreateSchema`
  - `DELETE /arc` — removes the arc YAML file
- [ ] Arc routes resolve aspect UUID → key via the aspect indexer (aspect key needed for file path)
- [ ] Regenerate orval client

**Frontend — arc editor component:**

- [ ] Arc editor: expandable panel within each aspect row in the Aspects tab
- [ ] Display control points as an editable table of `(x, y)` pairs — input fields clamped to [0, 1]
- [ ] Add / remove control points; enforce minimum 2 points
- [ ] Sort control points by `x` on save (spec requires ordered points)
- [ ] SVG curve preview: render a simple polyline connecting control points, drawn in the panel header even when collapsed (thumbnail of the shape)
- [ ] Save arc on explicit "Save arc" button; discard on cancel
- [ ] If no arc exists for an aspect, show "Define arc" button to initialize with two default points `({x: 0, y: 0.5}, {x: 1, y: 0.5})`
- [ ] If arc exists, show "Remove arc" button with confirmation

---

## Phases

### Phase 1: Layout

- [x] Tabbed layout
- [x] Load project data

### Phase 2: General tab

- [x] `PATCH /projects/:id` route + storage
- [x] Project name inline-edit
- [x] Vault path read-only display

### Phase 3: Notes + References tabs (parallel)

- [ ] Notes: list, create, delete
- [ ] References: list, create, delete
- [ ] Shared `AttachableEntityPanel` component

### Phase 4: Aspects tab

- [ ] Aspects: list, create, delete (key displayed as read-only)

### Phase 5: Arc editor

- [ ] Arc vault methods
- [ ] Arc API routes
- [ ] Arc editor component (table + SVG preview)
- [ ] Save/remove arc flow

### Phase 6: Aspect rename (backend only, deferrable)

- [ ] `PATCH /aspects/:id` route + rename storage logic + orphaned-weight warnings
- [ ] Regenerate orval client
- [ ] Add rename UI to Aspects tab once route exists

---

## Out of scope

- Interleaving config — data model is unsettled (open question in spec); not built here
- Body editing for notes/references — belongs in a dedicated editor, not the config page
- Arc curve fitting from existing sequence — future feature noted in spec
- Bulk rename of fragment properties after aspect key rename
- Attaching notes/references to entities other than fragments
