# Spec: Fragment Editor

**Status**: Stable
**Last updated**: 2026-04-26

---

## Outcome

The fragment editor is a focused, single-fragment view. It lets the user read and edit a fragment's prose content and its metadata (title, readiness, notes, references, aspect weights). One fragment at a time. The editor does not concern itself with sequencing, arc fitting, interleaving, or the ordering of fragments relative to each other.

---

## Scope

### In scope

- Prose content editing (body only — no frontmatter parsing on the client)
- Metadata editing: title, `readyStatus`, linked notes, linked references, aspect weights
- Save
- Discard / restore lifecycle action
- Reflecting vault-side changes via SSE events (live reload on external edit)
- Vim mode as an opt-in prose editor variant (hardcoded prop for now)

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

A single Save button collects both the prose editor content and the validated metadata form values, then saves the entire fragment all at once. Saves are explicit — no auto-save.

If metadata validation fails (e.g. empty title), the save is aborted and no request is sent.

### Live updates

An SSE connection notifies the editor when the vault changes. On relevant events the fragment query is invalidated, causing a re-fetch. The form resets to the new server state only when there are no unsaved changes.

---

## Constraints

- **Notes and references are read-only in terms of creation.** The editor can only link existing vault notes/references. It cannot create new ones.
- **No concurrent auto-save.** Auto-save is blocked until the API exposes `version`-based optimistic locking (409 on stale writes).

---

## Prior decisions

| Decision                                                                                           | Source                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TipTap for default prose mode (not CM6 + remark/rehype as originally planned)                      | Implementation diverged from `references/plans/fragment-editor.md` Phase 2; TipTap WYSIWYG was chosen in practice |
| CM6 + `@replit/codemirror-vim` for vim mode                                                        | `references/plans/fragment-editor.md`                                                                             |
| Single save button for both prose and metadata                                                     | TODO.md (`[x] Only keep one save button`)                                                                         |
| Explicit save only; no auto-save                                                                   | `references/plans/fragment-editor.md` — concurrent save risk, needs `version` lock first                          |
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
- **Fragment selection / random presentation**: What drives which fragment is shown? The editor doesn't own this — but the spec for the session/navigation layer is not yet written.
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
