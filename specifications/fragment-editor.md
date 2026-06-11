# Spec: Fragment Editor

**Status**: Stable
**Last updated**: 2026-05-15

**Shipped**:

- 2026-06-11 — **Focus mode**: an explicit, per-project-persisted toggle (default off, honored on mount, never auto-forced) lifts the editor into a fixed full-viewport overlay below the navbar, hiding all host chrome. Available wherever the fragment editor mounts (dedicated editor, list, Overview/Preview inline overlay, suggestion). Toggling never remounts the editor, so the unsaved buffer + cursor survive. Independent of the metadata-sidebar collapse. (`editor:toggle-focus`; plan: references/plans/fragment-editor-focus-mode.md)
- 2026-06-11 — **Editor navigation**: the editor renders consistent Previous/Next controls (and owns the `⌘↵`→next hotkey) when a view supplies them. The editor is a slot-provider only — each view composes its own save-then-advance command and ordering (list order, sequence/assembled order, or suggestion's random selection). (plan: references/plans/fragment-editor-focus-mode.md)
- 2026-06-11 — **Inline editing rework**: in Overview and Preview the editor now opens as a center-replacing overlay (`showMargin` suppressed), replacing the old in-place markdown-split editor; on close the host returns to the top of the last-shown fragment (ADR 0013). (plan: references/plans/fragment-editor-focus-mode.md)
- 2026-06-04 — Anchor deletion drops the anchor when its whole block collapses (margins-4): the orphan trigger is the anchor's block being deleted, not merely the content around its block-end offset. Rich uses ProseMirror `mapResult(...).deletedAcross` (both sides deleted); vim/raw maps the anchor's blank-line block and drops only when that block's content fully collapses. So deleting a paragraph orphans its comment (re-attaching by excerpt on paste-back), while deleting one line of a multi-line soft-wrapped paragraph keeps the anchor bound to the surviving block. (plan: references/plans/margins-4.md, Phase 7 + follow-up)
- 2026-06-04 — Coupled fragment+Margin save (margins-4): the fragment editor's save (`editor:save` / `:w` / `mod+s` / the editor Save button) persists the fragment **and** its Margin together; the Margin has no separate Save button, and a margin-only edit dirties the editor so it gates/enables the editor Save. The fragment is re-written only when its prose changed; a dirty Margin is always flushed. The linked swap pair and single recovery banner are unchanged. (plan: references/plans/margins-4.md, Phase 4)
- 2026-06-03 — Buffer-clean comment anchoring (ADR 0009): the editor buffer holds pure markdown — `<!--c:ID-->` anchor markers are stripped on load and re-emitted on save (fixing end-of-paragraph caret breakage), with the live comment↔block binding maintained by mapping anchor positions through editor transactions (rich: a ProseMirror plugin; vim/raw: a CM6 `StateField`). The dot cue on annotated lines is driven by the anchor store; the "show source" toggle (`editor:toggle-show-source`) is removed (no buffer markers to reveal). Document-side spacers (a TipTap widget / CM6 block widget) keep the Margin column's rows flow-aligned to the editor. (plan: references/plans/margins-3.md; ADR 0009)
- 2026-04-08 — Default prose editor uses WYSIWYG editing; content is stored as raw markdown. (plan: references/plans/prose-editor-tiptap.md)
- 2026-04-20 — Dedicated single-fragment editing view with prose editor (supporting vim mode) and metadata form (readiness, notes, references, aspect weights). (plan: references/plans/fragment-editor.md)
- 2026-05-05 — Fragment editor gained inline key (filename stem) editing with the same rename pattern as notes, references, and aspects; discard/restore and metadata sidebar wired as shell slots. (plan: references/plans/entity-editor-unification.md)
- 2026-05-09 — Metadata fields (notes, references, aspect weights, ready status) save instantly as the user edits each field; no explicit save action required for metadata. (plan: references/plans/entity-live-metadata-save.md)
- 2026-05-10 — Users can configure font size and paragraph width per project; settings apply live across all editor modes. (plan: references/plans/editor-typography-settings.md)
- 2026-05-19 — Prose content edits are mirrored to a `.maskor/swap/` file per entity. If the browser is closed or crashes before save, the next time the entity is opened the cached content is restored into the editor and a banner offers Restore-from-server. Applies to fragments, aspects, notes, and references. (plan: references/plans/entity-content-swap-files.md)
- 2026-05-25 — Orphaned aspect entries (aspect keys present in fragment frontmatter whose definition no longer exists in the project) are rendered in the metadata editor with a muted style and "orphaned" badge. The user can detach orphaned aspects using the same × affordance as live aspects. (plan: scripts/ralph/archive/2026-05-16-small-improvements/)
- 2026-05-28 - Editor remembers cursor position for each entity and restores it on load. Users can leave the editor and when they return, easily pick up their work. Cursor state is persistent in local storage.
- 2026-05-28 — Font size and paragraph width are adjustable from inside the editor via an "Aa" popover button in the toolbar, without leaving the editor. Changes persist to project.json immediately. The same adjustments are also available as palette commands (editor:increase-font-size, editor:decrease-font-size, editor:increase-margin, editor:decrease-margin). Applies to all entity editor types (fragment, note, reference, aspect). (plan: scripts/ralph/archive/2026-05-28-small-improvements/)
- 2026-05-28 - In vim mode, the editor ignores all keyboard events that also trigger a command using the command system, see `specifications/command-palette.md`, to avoid an expected command also triggering a vim binding at the same time.
- 2026-06-02 — A "Comment this block" gesture (`margin:comment-block`; command palette / `⌘⇧M` / "+ Comment" button) injects a trailing anchor marker on the fragment block at the cursor, seeds a bound comment stub in the Margin with the block excerpt, and moves focus to the Margin panel — coordinated buffer edits only, persisted on the respective next save. (plan: references/plans/margins.md, Phase 4)
- 2026-06-02 — The fragment and its Margin are a linked swap pair: the Margin's unsaved buffer is mirrored to `.maskor/swap/margin/<fragmentUuid>.json` alongside the fragment's swap. On reopen both restore together under a single recovery banner; "Restore from server" reverts the fragment and the Margin atomically. Independent saves clear each side's own swap. (Extends the 2026-05-19 swap entry.) (plan: references/plans/margins.md, Phase 5)
- 2026-06-01 — Margin anchor markers (`<!--c:ID-->`) render in both editor modes and survive editor round-trips. In rich (TipTap) mode the marker is a schema-modeled invisible inline node with matching markdown parse + serialize, so it survives markdown→ProseMirror→markdown byte-stable. In raw/vim (CM6) mode a decoration hides the whole marker with a zero-width replace (no gap), marks the line with a subtle line-end cue, and reveals the raw marker only when the cursor is on that line; the marker is preserved verbatim in the buffer. (plan: references/plans/margins.md, Phase 3)
- 2026-06-02 — Vim/raw anchor markers are now always hidden (no reveal-on-cursor); annotated lines show a subtle line-end dot cue, and the raw markers are revealed only behind a per-project "show source" toggle (`editor:toggle-show-source`, default off; also in the editor's "Aa" display popover). (plan: references/plans/margins-2.md, Phase 1; ADR 0008)
- 2026-06-02 — The fragment editor exposes block-level operations to its Margin column: inject a marker into an arbitrary block (type-to-create), strip a marker (delete), report the cursor block's index/marker (gesture jump), focus a marker's block (Escape from a comment), and surface scroll element + block heights for scroll-sync and margin-side padding. The "Comment this block" gesture is now a jump to the paragraph's margin slot. (plan: references/plans/margins-2.md, Phase 4; ADR 0008)
- 2026-06-04 — Save round-trip contract: the rich editor (TipTap) no longer reloads its document on a save that round-trips equivalently (modulo trailing whitespace, which the server normalizes via body.trim()). The caret stays at its pre-save position. Unchanged prose skips the API call entirely. The normalization rule (body.trim()) is documented in the Save round-trip contract section. (plan: scripts/ralph/archive/2026-06-04-small-fixes/)
- 2026-06-05 — Rich-mode automatic typography substitution: the Tiptap `@tiptap/extension-typography` extension is active in rich (TipTap) mode, converting `--` to em dash (—), `...` to ellipsis (…), and straight quotes to curly quotes as the user types. Substitution is always on in rich mode (no setting); raw markdown and vim (CM6) modes are unaffected. Substituted characters are stored as their Unicode glyphs in the saved markdown and round-trip byte-stable through save/load. Code spans and code blocks are excluded from substitution by the extension's input rules. (plan: scripts/ralph/archive/2026-06-05-todo-triage-fixes/)
- 2026-06-05 — TODO Triage — small bug fixes and minor editor features triaged from references/TODO.md: suggestion-mode state, editor save round-trip, margin alignment, aspect picker, auto-typography, vim clipboard toggle. (plan: scripts/ralph/archive/2026-06-05-todo-triage-fixes/)
- 2026-06-05 — Per-project vim clipboard sync toggle: a `vimClipboardSync` boolean in `project.json` editor config controls whether vim yank (`y`/`yy`/`Y`) and delete (`d`/`dd`/`D`/`x`) also write to the system clipboard. Defaults to `true`. The toggle is exposed in the editor's "Aa" display popover (visible only when vim mode is active). When off, yanks and deletes stay in vim registers only and leave the system clipboard untouched. When on, the unnamed register text is mirrored to the OS clipboard; explicit register operations (e.g. `"+y`) and `p`/`P` paste semantics are unchanged. (plan: scripts/ralph/archive/2026-06-05-todo-triage-fixes/)

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

### In scope (continued)

- **Focus mode** — an explicit, per-project-persisted presentation that hides all chrome but the navbar (see `_glossary.md`). Rendered wherever the editor mounts.
- **Navigation controls** — the editor renders view-supplied Previous/Next. It owns the controls and the `⌘↵`→next hotkey; the _ordering and any side effects_ are owned by the mounting view (see Navigation below).

### Out of scope

- Sequencing, arc fitting, fitting scores — not shown or edited here
- Creating new notes or references from within the editor — only existing vault entries can be linked
- Creating new aspects from within the editor (desired future feature; currently out of scope)
- Auto-save — explicitly deferred until `version`-based optimistic locking is in the API
- **Which** fragment is next and the act of advancing — decided by the caller, not the editor. The editor renders the Previous/Next controls but never computes ordering or performs the save-then-advance.
- Project configuration, aspect/arc management

---

## Behavior

### Layout

Two-panel layout: metadata sidebar (left/top) + prose editor (right/bottom). Sidebar is fixed-width on wide screens, stacked on narrow.

### Navigation (Previous / Next)

The editor renders a Previous/Next control pair when the mounting view supplies a navigation slot, and owns the `⌘↵`→next hotkey. The editor is a dumb slot-provider: each view composes its own save-then-advance behaviour (and any side effects) and supplies the ordering. Traversal is exactly what the view renders:

- **Fragment list** — the currently filtered list order (search + show-discarded respected).
- **Overview** — placed fragments in spine order (unassigned pool and discarded excluded).
- **Preview** — the assembled sequence order.
- **Suggestion** — the non-deterministic prompting selection (see `prompting.md`); never disables Next.

Boundaries disable Previous/Next at the first/last item (no wrap); suggestion is unbounded. In the Overview/Preview overlay, `⌘Esc` closes the editor and returns to the host (bare `Esc` is left to vim).

### Focus mode

An explicit, per-project-persisted toggle (default off, honored on mount, never auto-forced) that hides all surrounding chrome except the navbar, presenting the editor as a centered full-viewport overlay. Orthogonal to the metadata-sidebar collapse, and to inline editing (opening the Overview/Preview overlay does not imply focus). See `_glossary.md`.

### Prose editor

Two modes, regular or vim mode.

- **Default mode**: WYSIWYG-ish markdown editor. User edits rich text, the markdown is hidden from view. No frontmatter — body only.
- **Vim mode**: Raw markdown source with full vim modal editing.

### Rich-mode typography substitution

The rich editor (TipTap) applies automatic typographic substitutions as the user types via the `@tiptap/extension-typography` extension:

- `--` → em dash (—)
- `...` → ellipsis (…)
- Straight quotes → curly/smart quotes (" " and ' ')

This is always on in rich mode. Raw markdown and vim modes are untouched. Substituted characters are stored as Unicode glyphs in the saved markdown and round-trip byte-stable. Code spans and code blocks are excluded from substitution.

### Save contract

Two-tier save model:

- **Prose content** — explicit Save button only. No auto-save.
- **Metadata fields** (notes, references, aspect weights, ready status) — save instantly, per field, as the user edits (400 ms debounce, optimistic UI). No Save button required.

### Save round-trip contract

The save pipeline is designed to be non-destructive: a save that does not change the content must not move the cursor or alter the editor buffer.

- **Whitespace normalization**: The server trims the fragment body on write (`body.trim()`). Leading and trailing whitespace in the saved content is stripped. This is the intended normalization; downstream tools rely on clean bodies.
- **No caret reset on equivalent content**: After a successful save, when the server's returned content is equivalent to the editor's current content (modulo trailing whitespace from the normalization above), the rich editor (TipTap) does not reload its document. No `setContent` call fires, so the caret stays at its pre-save position.
- **Unchanged prose skips the API call**: When the prose is clean (not dirty), `updateFragment` is never called during a content save. The caret and buffer are untouched regardless of whether the margin is dirty.
- **CM6 (raw/vim)**: When the server's clean content (`body` from the vault parse, which includes a trailing newline from the file structure) differs from the editor's doc (e.g., after the user deletes a trailing newline), `@uiw/react-codemirror` maps the selection through the content change. The cursor position maps correctly; no dramatic jump occurs.

### Live updates

An SSE connection notifies the editor when the vault changes. On relevant events the fragment query is invalidated, causing a re-fetch. The form resets to the new server state only when there are no unsaved changes.

---

## Constraints

- **Notes and references are read-only in terms of creation.** The editor can only link existing vault notes/references. It cannot create new ones.
- **No auto-save for prose content.** Prose auto-save is blocked until the API exposes `version`-based optimistic locking (409 on stale writes). Metadata fields are not subject to this constraint — they are small, idempotent writes with no version-collision risk.

---

## Prior decisions

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Source                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TipTap for default prose mode (not CM6 + remark/rehype as originally planned)                                                                                                                                                                                                                                                                                                                                                                                 | Implementation diverged from `references/plans/fragment-editor.md` Phase 2; TipTap WYSIWYG was chosen in practice |
| CM6 + `@replit/codemirror-vim` for vim mode                                                                                                                                                                                                                                                                                                                                                                                                                   | `references/plans/fragment-editor.md`                                                                             |
| Save button applies to prose content only; metadata fields save instantly per field (debounced)                                                                                                                                                                                                                                                                                                                                                               | `references/plans/entity-live-metadata-save.md`; earlier plan assumed unified save — implementation diverged      |
| Prose auto-save deferred; metadata instant-save is safe without version locking                                                                                                                                                                                                                                                                                                                                                                               | `references/plans/fragment-editor.md` — version lock needed for prose; metadata writes are idempotent             |
| Unknown aspect keys preserved on save                                                                                                                                                                                                                                                                                                                                                                                                                         | `references/plans/fragment-editor.md`                                                                             |
| Case-only renames (e.g. `Chapter One` → `chapter one`) are supported on case-insensitive filesystems (macOS APFS, Windows NTFS). The storage layer uses a temp-file roundtrip to change the on-disk casing without data loss.                                                                                                                                                                                                                                 | US-002 bug fix (`packages/storage/src/service/storage-service.ts`)                                                |
| Orphaned aspect entries are rendered in the metadata editor with a muted style and "orphaned" badge, and can be detached via the same × button. This makes orphans visible and removable — previously they were silently hidden (`visibleAspects` filtered on `knownAspectKeys`).                                                                                                                                                                             | US-009 (`fragment-metadata-form.tsx`)                                                                             |
| Font size and paragraph width are adjustable inline via an "Aa" popover in the editor toolbar, without navigating to project config. The same adjustments are registered as editor-scope commands (`editor:increase-font-size`, `editor:decrease-font-size`, `editor:increase-margin`, `editor:decrease-margin`) so they appear in the command palette. Changes persist immediately to `project.json`. The inline control applies to all entity editor types. | US-012 (`entity-editor-shell.tsx`, `scopes/editor.ts`)                                                            |
| Notes/references restricted to existing vault entries                                                                                                                                                                                                                                                                                                                                                                                                         | TODO.md (`[x] Only allow adding notes/references that already exist`)                                             |
| Discard button on editor                                                                                                                                                                                                                                                                                                                                                                                                                                      | TODO.md (`[x] Fragment editor needs a discard button`)                                                            |
| `fragment-detail.tsx` retained on project shell page; `fragment-editor.tsx` is `FragmentPage` only                                                                                                                                                                                                                                                                                                                                                            | `references/plans/fragment-editor.md`                                                                             |

---

## Open questions

- **`vimMode` settings wiring**: Where does the vim preference live? A per-user settings table, a local config file, or a project-level config? Unresolved — see `suggestions.md`.
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
