# Spec: Fragment Editor

**Status**: Stable
**Last updated**: 2026-05-15

**Shipped**:

- 2026-04-08 — Default prose editor uses WYSIWYG editing; content is stored as raw markdown. (plan: references/plans/prose-editor-tiptap.md)
- 2026-04-20 — Dedicated single-fragment editing view with prose editor (supporting vim mode) and metadata form (readiness, notes, references, aspect weights). (plan: references/plans/fragment-editor.md)
- 2026-05-05 — Fragment editor gained inline key (filename stem) editing with the same rename pattern as notes, references, and aspects; discard/restore and metadata sidebar wired as shell slots. (plan: references/plans/entity-editor-unification.md)
- 2026-05-09 — Metadata fields (notes, references, aspect weights, ready status) save instantly as the user edits each field; no explicit save action required for metadata. (plan: references/plans/entity-live-metadata-save.md)
- 2026-05-10 — Users can configure font size and paragraph width per project; settings apply live across all editor modes. (plan: references/plans/editor-typography-settings.md)
- 2026-05-19 — Prose content edits are mirrored to a `.maskor/swap/` file per entity. If the browser is closed or crashes before save, the next time the entity is opened the cached content is restored into the editor and a banner offers Restore-from-server. Applies to fragments, aspects, notes, and references. (plan: references/plans/entity-content-swap-files.md)

---

## Outcome

The fragment editor is a focused, single-fragment view. It lets the user read and edit a fragment's prose content and its metadata (title, readiness, notes, references, aspect weights). One fragment at a time. The editor does not concern itself with sequencing, arc fitting, interleaving, or the ordering of fragments relative to each other.

---

## Scope

### In scope

- Prose content editing (body only — no frontmatter parsing on the client)
- Metadata editing: `readyStatus`, linked notes, linked references, aspect weights. `key` (the fragment's display name) is editable via the rename control in `EntityEditorShell`, not the metadata form.
- Save
- Discard / restore lifecycle action
- Reflecting vault-side changes via SSE events (live reload on external edit)
- Vim mode as an opt-in prose editor variant

### Out of scope

- Sequencing, arc fitting, fitting scores — not shown or edited here
- Creating new notes or references from within the editor — only existing vault entries can be linked
- Creating new aspects from within the editor (desired future feature; currently out of scope)
- Auto-save — explicitly deferred until `version`-based optimistic locking is in the API
- Fragment navigation / selection (which fragment to show next is decided by the caller, not the editor)
- Project configuration, aspect/arc management

---

## Behavior

### Layout

Two-panel layout: metadata sidebar (left/top) + prose editor (right/bottom). Sidebar is fixed-width on wide screens, stacked on narrow.

### Prose editor

Two modes, regular or vim mode.

- **Default mode**: WYSIWYG-ish markdown editor. User edits rich text, the markdown is hidden from view. No frontmatter — body only.
- **Vim mode**: Raw markdown source with full vim modal editing.

### Save contract

Two-tier save model:

- **Prose content** — explicit Save button only. No auto-save.
- **Metadata fields** (notes, references, aspect weights, ready status) — save instantly, per field, as the user edits (400 ms debounce, optimistic UI). No Save button required.

### Live updates

An SSE connection notifies the editor when the vault changes. On relevant events the fragment query is invalidated, causing a re-fetch. The form resets to the new server state only when there are no unsaved changes.

---

## Constraints

- **Notes and references are read-only in terms of creation.** The editor can only link existing vault notes/references. It cannot create new ones.
- **No auto-save for prose content.** Prose auto-save is blocked until the API exposes `version`-based optimistic locking (409 on stale writes). Metadata fields are not subject to this constraint — they are small, idempotent writes with no version-collision risk.

---

## Prior decisions

| Decision                                                                                           | Source                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TipTap for default prose mode (not CM6 + remark/rehype as originally planned)                      | Implementation diverged from `references/plans/fragment-editor.md` Phase 2; TipTap WYSIWYG was chosen in practice |
| CM6 + `@replit/codemirror-vim` for vim mode                                                        | `references/plans/fragment-editor.md`                                                                             |
| Save button applies to prose content only; metadata fields save instantly per field (debounced)    | `references/plans/entity-live-metadata-save.md`; earlier plan assumed unified save — implementation diverged      |
| Prose auto-save deferred; metadata instant-save is safe without version locking                    | `references/plans/fragment-editor.md` — version lock needed for prose; metadata writes are idempotent             |
| Unknown aspect keys preserved on save                                                              | `references/plans/fragment-editor.md`                                                                             |
| Notes/references restricted to existing vault entries                                              | TODO.md (`[x] Only allow adding notes/references that already exist`)                                             |
| Discard button on editor                                                                           | TODO.md (`[x] Fragment editor needs a discard button`)                                                            |
| `fragment-detail.tsx` retained on project shell page; `fragment-editor.tsx` is `FragmentPage` only | `references/plans/fragment-editor.md`                                                                             |

---

## Open questions

- **`vimMode` settings wiring**: Where does the vim preference live? A per-user settings table, a local config file, or a project-level config? Unresolved — see `SUGGESTIONS.md`.
- **New aspect creation from the editor**: TODO.md marks this as open (`[ ] Allow adding new aspects on the fragment editor page`). Should aspects be creatable inline, or only via the project configuration view?
- **`readyStatus` visual indicator**: The plan mentioned a color/dot indicator next to the title. Not yet implemented. What does it look like?
- **Focus toggle shortcut**: Keyboard shortcut to switch focus between prose and metadata panels — desired but not yet defined.
- **Fragment selection / random presentation**: What drives which fragment is shown? The editor doesn't own this — see `navigation.md` for the surfacing model and prompting mechanism.
- **TipTap GFM table support**: Not currently installed. If fragments contain markdown tables, `@tiptap/extension-table` is needed.

---

## Acceptance criteria

- Loading a fragment displays its body in the prose editor and its metadata fields in the sidebar form.
- Saving sends an update request to the server.
- Frontend validates the fragment format before sending requests to the server.
- Aspect weights for aspects no longer in the project remain present in the saved file after a save.
- Discarding a fragment shows the discarded banner; restoring removes it.
- An external Obsidian edit to a fragment updates the editor after the SSE event fires, provided the user has no unsaved changes.
- Vim mode: `:w` triggers the same save as the Save button.
