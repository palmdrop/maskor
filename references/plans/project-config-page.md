# Project Config Page

**Date**: 28-04-2026
**Status**: In progress

---

## Goal

The ProjectConfigPage is fully implemented: project name is editable, aspects can be created/renamed/deleted, notes and references can be created/deleted, and arcs can be authored per aspect via a curve editor.

Related plan(s): `specifications/project-config-vault-storage.md`

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

- [x] Notes tab: list existing notes (titles only) via `useListNotes`
- [x] Notes tab: create note with title + optional initial body via dialog → `useCreateNote`
- [x] Notes tab: delete note → `useDeleteNote`; no warning needed unless future "warn if attached" is added
- [x] References tab: list existing references (names only) via `useListReferences`
- [x] References tab: create reference with name + optional initial body via dialog → `useCreateReference`
- [x] References tab: delete reference → `useDeleteReference`
- [x] Extract shared `AttachableEntityPanel` component reused by both tabs (list + create dialog + delete button)
- [x] Note: body editing is out of scope for config page; body belongs in a dedicated editor or directly in vault
- [x] Notes tab: edit note body via dedicated `NoteEditorPage` at `/projects/:id/notes/:noteId` using `ProseEditor` → `useUpdateNote`; `PATCH /notes/:noteId` route + storage `update` added
- [x] References tab: edit reference body via dedicated `ReferenceEditorPage` at `/projects/:id/references/:referenceId` using `ProseEditor` → `useUpdateReference`; `PATCH /references/:referenceId` route + storage `update` added

### Phase 4: Aspects tab — CRUD

- [x] Aspects tab: list existing aspects via `useListAspects` (show key + optional category)
- [x] Aspects tab: create aspect with key + optional category + optional description → `useCreateAspect`
- [x] Aspects tab: delete aspect → `useDeleteAspect` with confirmation dialog

Rename is a backend-only concern tracked separately in Phase 6. The frontend shows the key as read-only text for now. No UI work is blocked on Phase 6.

### Phase 5: Arc editor (per aspect)

Arcs are vault-stored at `<vault>/.maskor/config/arcs/<aspect-key>.yaml`. They are NOT watcher-indexed — read and written directly on demand.

**Storage layer:**

- [x] Implement arc vault methods: `readArc(context, aspectKey): Arc | null`, `writeArc(context, arc): void`, `deleteArc(context, aspectKey): void`
- [x] Arc file format: YAML with `uuid`, `aspectKey`, and `points` (array of `{x, y}`)
- [x] No DB indexing for arcs (consistent with watcher ignoring `.maskor/`)

**API layer:**

- [x] Add arc routes under `/projects/:projectId/aspects/:aspectId`:
  - `GET  /arc` — returns the arc or 404 if none
  - `PUT  /arc` — creates or replaces the arc (idempotent); body is `ArcCreateSchema`
  - `DELETE /arc` — removes the arc YAML file
- [x] Arc routes resolve aspect UUID → key via the aspect indexer (aspect key needed for file path)
- [x] Regenerate orval client

**Frontend — arc editor component:**

- [x] Arc editor: expandable panel within each aspect row in the Aspects tab
- [x] Display control points as an editable table of `(x, y)` pairs — input fields clamped to [0, 1]
- [x] Add / remove control points; enforce minimum 2 points
- [x] Sort control points by `x` on save (spec requires ordered points)
- [x] SVG curve preview: render a simple polyline connecting control points, drawn in the panel header even when collapsed (thumbnail of the shape)
- [x] Save arc on explicit "Save arc" button; discard on cancel
- [x] If no arc exists for an aspect, show "Define arc" button to initialize with two default points `({x: 0, y: 0.5}, {x: 1, y: 0.5})`
- [x] If arc exists, show "Remove arc" button with confirmation

### Phase 5b: Key schema unification

Unify `note.title` and `reference.name` to `key`, matching aspect terminology. Drop `slugify` for all three entity types — the key is used directly as the vault filename stem. This makes the stored key, the vault filename, and the frontmatter reference identical strings, which is required for Obsidian-compatible manual vault editing (`[[My Note]]` resolves correctly; frontmatter edits use the exact key string).

**This is a breaking schema change.** Storage, API, DB, and frontend are all affected.

**Key validation rules (shared, all three entity types):**

- Trim leading/trailing whitespace on input
- Reject empty string after trim
- Reject keys containing `::` (breaks inline field parsing for aspects; disallowed across all types for consistency)
- Reject keys that case-insensitively match any existing key of the same entity type (prevents filesystem collisions on case-insensitive filesystems like macOS APFS)

**Shared schemas:**

- [x] `NoteSchema`, `NoteCreateSchema`, `NoteUpdateSchema`: rename `title` → `key`
- [x] `ReferenceSchema`, `ReferenceCreateSchema`, `ReferenceUpdateSchema`: rename `name` → `key`
- [x] Add `validateEntityKey(key: string): string` shared utility (trim + `::` check); used by all three create/update paths

**Storage layer:**

- [x] Remove `slugify()` from aspect, note, and reference write/update paths in `storage-service.ts` — use `key` directly as the filename stem
- [x] Update note vault mapper: `title` → `key` in YAML frontmatter field name
- [x] Update reference vault mapper: `name` → `key` in YAML frontmatter field name
- [x] Add case-insensitive uniqueness check in `aspects.write`, `notes.write`, `references.write`; query all existing keys, compare lowercased, return a `KEY_CONFLICT` error if matched
- [x] `slugify` is still used for fragment filenames — do not remove the import, just stop calling it for these three entity types

**DB migration:**

- [x] `notes` table: rename column `title` → `key`; update unique constraint
- [x] `fragment_notes` table: rename column `note_title` → `note_key`
- [x] `aspect_notes` table: rename column `note_title` → `note_key`
- [x] `project_references` table: rename column `name` → `key`; update unique constraint
- [x] `fragment_references` table: rename column `reference_name` → `reference_key`
- [x] Make sure `key` is indexed for all types
- [x] Write Drizzle migration covering all of the above

**API schemas:**

- [x] Update `packages/api/src/schemas/note.ts` and `reference.ts` to use `key`
- [x] Regenerate orval client (generated types manually updated; run `bun run codegen` in packages/frontend with API running to regenerate fully)

**Frontend:**

- [x] Replace all `note.title` → `note.key` and `reference.name` → `reference.key` in components, pages, and hooks
- [x] Update create dialogs: note label "Title" → "Key", reference label "Name" → "Key"

---

### Phase 6: Aspect rename

Rename is isolated to the storage and API layers initially. The frontend tab work is the final step.

**Why it's complex:** `aspect.key` is simultaneously the vault filename (`aspects/<key>.md`), the inline field key in every attached fragment (`key:: weight`), and the arc filename (`.maskor/config/arcs/<key>.yaml`). A single rename must cascade across all three. The current `aspects.update` in `storage-service.ts` explicitly strips `key` from the patch — this is the intentional deferral point.

**Storage layer:**

- [ ] Extend `aspects.update` to handle `key` changes. When `patch.key` differs from `current.key`:
  1. Compute old and new vault paths: `aspects/<old-key>.md` → `aspects/<new-key>.md`
  2. Write new vault file (same UUID, updated `key` field); delete old vault file
  3. If arc file exists at `.maskor/config/arcs/<old-key>.yaml`: read it, update its `aspectKey` field to the new key, write to `.maskor/config/arcs/<new-key>.yaml`, delete old arc file
  4. Query `fragment_properties WHERE aspect_key = old-key` to get all affected `fragmentUuid`s
  5. For each affected fragment: read vault file, replace the old key with the new key in the `properties` frontmatter map (preserving the weight), write vault file, inline-update the `fragment_properties` row (delete old key row, insert new key row)
  6. DB: update the `aspects` row — new `key`, new `filePath`, new `contentHash`
  7. Return `{ aspect: Aspect; warnings: string[] }` where `warnings` lists the affected fragment UUIDs

- [ ] Add a dedicated response type `AspectUpdateResponse` in shared schemas: `{ aspect: Aspect; warnings: string[] }`

**API layer:**

- [ ] Add `PATCH /projects/:projectId/aspects/:aspectId` route using `AspectUpdateSchema`; return `AspectUpdateResponse`
- [ ] Regenerate orval client

**Frontend:**

- [ ] Add inline rename input to each aspect row in the Aspects tab (edit-in-place, same pattern as project name in General tab)
- [ ] If `warnings` is non-empty in the response, show a dismissable banner listing affected fragment UUIDs (or titles if available from the index)

### Phase 6b: Note and reference rename cascade

Notes and references already have `update` methods and `PATCH` routes (from Phase 3). After Phase 5b, those methods handle the vault file rename when the key changes, but they do **not** cascade to dependent fragment or aspect files. This phase adds the cascade.

**Why it matters:** `note.key` is stored verbatim in `fragment_notes.note_key` and in fragment frontmatter `notes: string[]`. Renaming a note's key without updating attached fragments leaves the frontmatter referencing a non-existent key. Same for `reference.key` → `fragment_references.reference_key`.

Notes also appear in `aspect_notes.note_key` — aspects can reference notes by key too, so aspect vault files need the same cascade treatment.

**Storage layer — extend `notes.update`:**

When `patch.key` is provided and differs from `current.key`:

1. Capture `oldKey` before the write (Phase 5b write logic handles the new file + old file deletion)
2. Query `fragment_notes WHERE note_key = oldKey` → list of `fragmentUuid`s
3. For each affected fragment: read vault file, replace `oldKey` with `newKey` in the `notes` frontmatter array, write vault file, inline-update `fragment_notes` row
4. Query `aspect_notes WHERE note_key = oldKey` → list of `aspectUuid`s
5. For each affected aspect: read vault file, replace `oldKey` with `newKey` in the aspect's `notes` array field, write vault file, inline-update `aspect_notes` row
6. Return `{ note: Note; warnings: { fragments: string[]; aspects: string[] } }`

- [ ] Add `NoteUpdateResponse` shared type: `{ note: Note; warnings: { fragments: string[]; aspects: string[] } }`
- [ ] Extend `notes.update` with the cascade logic above
- [ ] Update `PATCH /projects/:projectId/notes/:noteId` to return `NoteUpdateResponse`
- [ ] Regenerate orval client

**Storage layer — extend `references.update`:**

When `patch.key` is provided and differs from `current.key`:

1. Capture `oldKey` before the write (Phase 5b write logic handles the new file + old file deletion)
2. Query `fragment_references WHERE reference_key = oldKey` → list of `fragmentUuid`s
3. For each affected fragment: read vault file, replace `oldKey` with `newKey` in the `references` frontmatter array, write vault file, inline-update `fragment_references` row
4. Return `{ reference: Reference; warnings: { fragments: string[] } }`

- [ ] Add `ReferenceUpdateResponse` shared type: `{ reference: Reference; warnings: { fragments: string[] } }`
- [ ] Extend `references.update` with the cascade logic above
- [ ] Update `PATCH /projects/:projectId/references/:referenceId` to return `ReferenceUpdateResponse`
- [ ] Regenerate orval client

**Frontend:**

Key editing is not yet exposed in `NoteEditorPage` or `ReferenceEditorPage` (only body content is editable there). Add a key rename field and surface warnings inline if the cascade affected other files.

- [ ] Add key rename input to `NoteEditorPage` (edit-in-place, same pattern as project name)
- [ ] Add key rename input to `ReferenceEditorPage`
- [ ] If `warnings` is non-empty after save, show a dismissable banner listing affected fragment/aspect UUIDs

---

### Phase 7: Extended project type

Add important configuration options to project.

- [x] Add config for using vimMode in editors
- [x] Add config for using "raw markdown mode", i.e not tiptaps rich editing (vimMode enables this by default)

---

## Out of scope

- Interleaving config — data model is unsettled (open question in spec); not built here
- Body editing for notes/references — belongs in a dedicated editor, not the config page
- Arc curve fitting from existing sequence — future feature noted in spec
- Attaching notes/references to entities other than fragments
