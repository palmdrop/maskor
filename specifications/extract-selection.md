# Spec: Extract Selection

**Status**: Draft
**Last updated**: 2026-05-21
**Shipped**: First slice — fragment-target + Keep mode + Switch mode, from fragment body editor (Tiptap rich, CodeMirror raw and vim). `editor.extract-to-fragment` command registered in `EntityEditorShell`, scoped to `Editor` in the command palette. `ExtractToFragmentDialog` with pre-filled `unnamed-fragment-<n>`, live key validation (including discarded-fragment clash), Confirm/Cancel. `fragment:extracted` action-log entry written on success. Navigation to new fragment on confirm. See `references/plans/extract-selection.md`.

---

## Outcome

The user can select a contiguous range of text inside any entity's body — fragment, note, reference, or aspect — and turn that selection into a new entity of any of the same four types. The extract command opens a small modal that asks for a key and a few options; on confirm, the new entity exists in the vault and the source body is either left intact, cut, or (eventually) replaced with an inline link to the new entity. Extraction is the canonical refactor move: it converts "this passage deserves to be its own thing" from a multi-step copy-create-paste-delete chore into a single user action.

---

## Scope

### In scope

- Four entry-point commands — `Extract to fragment`, `Extract to note`, `Extract to reference`, `Extract to aspect` — registered by the body editor and surfaced in the command palette.
- A dedicated extraction modal that owns the key field, the source-side option, and the post-confirm option.
- Per-type uniqueness enforcement on the new key, reusing existing per-entity create validation.
- Source-side options: `Keep` (selection stays verbatim) and `Cut` (selection removed). `Link` (selection replaced with `[[type/key]]`) is reserved but not shipped here; see `document-links.md`.
- Post-confirm options: `Switch` (navigate to the new entity's editor) or `Stay` (remain on the source).
- A single action-log entry per extraction capturing source + target + options.

### Out of scope

- Arc as an extraction target. Arcs are sparse control-point YAML; there is no body to receive prose. See `aspect-arc-model.md`.
- Extraction from non-body surfaces: single-line metadata inputs (aspect category, fragment rename), the preview's assembled prose, the backlinks panel, the action log surface.
- Multi-range / disjoint-selection support. The editor selection APIs in use return a primary range; only that range is extracted.
- Preview as a source surface (would create cross-fragment extractions; no single source body to Cut from).
- Inline aspect creation from a fragment body with auto-tagging at weight > 0. The user must set meaningful weights separately, consistent with `document-links.md`.
- Sequence placement of the new fragment. Extraction never places. The overview / sequencer owns placement.
- Modal fields beyond key + the two options (no category, no readiness, no initial aspect weights). Enrichment happens in the destination entity's normal editor.
- The `Link` source-side mode itself, until `document-links.md` ships. The option is reserved in the data model but not exposed in v1.

---

## Behavior

### Triggering

Four commands are registered by the shared body-editor component via the `useCommand` hook defined in `command-palette.md`:

| Command ID                       | Palette label             |
| -------------------------------- | ------------------------- |
| `editor.extract-to-fragment`     | Extract to fragment…      |
| `editor.extract-to-note`         | Extract to note…          |
| `editor.extract-to-reference`    | Extract to reference…     |
| `editor.extract-to-aspect`       | Extract to aspect…        |

All four appear in the palette's view-scoped section (top of the list) under the `Editor` scope while a body editor is focused. They are absent from the palette outside of a body editor.

No hotkey in v1; bindings may be added later via the command-system's declarative hotkey field.

### Source surfaces

Extraction is available only when the focused surface is a body editor for a:

- Fragment
- Note
- Reference
- Aspect (the aspect's markdown description body)

All three editor modes — rich (Tiptap), raw markdown (CodeMirror), and vim (CodeMirror + vim keymap) — host the command identically. Selection is read from the **editor's authoritative selection state**, not the browser's text selection:

- Tiptap: `editor.state.selection` (ProseMirror). Selection slice is serialized via the editor's existing `prosemirror-markdown` serializer.
- CodeMirror (raw and vim): `view.state.selection.main`. Selection content is the raw substring.

### Selection validity

The command is enabled iff:

- A single, non-empty range exists in the focused body editor.
- The range's content, after trimming leading/trailing whitespace, is non-empty.

Otherwise the command is shown in the palette **disabled with reason**:

| Condition                                   | Reason text          |
| ------------------------------------------- | -------------------- |
| Empty selection (cursor only)               | "Select text first"  |
| Selection contains only whitespace          | "Select text first"  |
| No body editor focused                      | _Command not surfaced_ |

Disjoint / multi-cursor selections are not expected to arise in Maskor's editor configuration; if they do, the command operates on `selection.main` only.

### The extract modal

Triggering the command closes the palette and opens a dedicated modal scoped to the chosen target type. The modal contains:

- A title naming the target type (`Extract to fragment`, etc.).
- A read-only preview of the selection (truncated if long).
- A **key** textbox, focused on open, with its content pre-selected.
- A **source** option (`Keep` · `Cut`). `Link` is reserved but disabled until `document-links.md` ships.
- A **next** option (`Switch` · `Stay`).
- A `Confirm` button and a `Cancel` button.

The modal is focus-trapped. `Esc` cancels and returns focus to the editor. Confirm is disabled until the key is non-empty, validates against the per-type rules, and does not clash.

### Key pre-fill

The key field opens pre-filled with `unnamed-{type}-{n}`, where `n` is the smallest positive integer such that no entity of that type already has the key `unnamed-{type}-{n}`. For fragments, discarded fragments count toward the namespace (see Source-side behavior below for the rationale).

The pre-filled text is **pre-selected** so that:

- Pressing `Enter` immediately accepts the pre-fill and creates `unnamed-{type}-{n}`.
- Typing replaces the pre-fill in a single keystroke.

This is deliberately a fast-path: a writer mid-flow extracts a passage, accepts the disposable key, and renames the new entity later when the idea is clearer.

### Key validation

Validation is **per target type only** (cross-type collisions are permitted per `_glossary.md` and `document-links.md`). The rules are exactly the rules existing create flows (`createFragment`, `createNote`, `createReference`, `createAspect`) apply today; this feature must **not** introduce new validation. If the rules are not yet centralized in a shared validator, a refactor to extract one is the right path.

A key is considered clashing if any of the following exist within the target type's namespace:

- A live entity of that type with the same key.
- For fragments: a discarded fragment with the same key (`fragments/discarded/<key>.md`). The modal surfaces this with a specific reason: _"A discarded fragment uses this key. Restore or rename it first."_

Validation runs **live** as the user types, with a short debounce against the per-vault DB index. Confirm is disabled while the field is empty, invalid, or clashing. The server-side create remains authoritative: if a race causes the server to reject with `KEY_TAKEN`, the modal surfaces the error and stays open.

### Source-side behavior

Three source-side modes are defined; **two ship in v1**.

| Mode    | Effect on source body                                              | Shipped in v1 |
| ------- | ------------------------------------------------------------------ | ------------- |
| `Keep`  | Selection unchanged. Source body is not touched.                   | Yes           |
| `Cut`   | Selection removed via the editor's native delete-range operation.  | Yes           |
| `Link`  | Selection replaced with `[[type/key]]` per `document-links.md`.    | No (reserved) |

`Cut` is the v1 default. When `document-links.md` ships and `Link` is unlocked, the default flips to `Link`.

The editor performs the deletion natively; no block-aware repair, no list-marker fix-up. If the cut leaves an orphan list item or an empty paragraph, the user cleans it up — consistent with hitting `Delete` themselves. The extracted text is whatever the selection serializer produces (markdown, in both editor families); no snapping to block boundaries.

### Per-target field population

The modal asks for `key` and the two options. Every other field on the new entity defaults to its create-time default. Specifically:

| Target     | Populated from extraction      | Defaulted                                                                |
| ---------- | ------------------------------ | ------------------------------------------------------------------------ |
| Fragment   | `key`, `content` (= selection) | `readyStatus: 0`, empty `aspects`, empty `notes`, empty `references`, `isDiscarded: false`, unplaced (not in any sequence) |
| Note       | `key`, body (= selection)      | Timestamps, UUID                                                          |
| Reference  | `key`, body (= selection)      | Timestamps, UUID                                                          |
| Aspect     | `key`, body (= selection → description) | Empty `category`, empty notes                                            |

Extraction never modifies any aspect-weight relationship on the source fragment. Notes/references/aspects extracted from a fragment body are not auto-attached as the fragment's metadata — that behavior is owned by `document-links.md` and is therefore tied to the (reserved) `Link` mode.

### Switch vs Stay

`Switch` is the v1 default. The two toggles (source-side and switch/stay) are **session-sticky**: the last setting in either toggle is remembered in memory and pre-selected on the next extraction. They reset on browser reload. They are not persisted to project config.

On `Switch`, the modal closes and the router navigates to the new entity's editor route.

### Save coupling with the source

The body editor's existing save contract (per `fragment-editor.md`) is: prose saves on explicit Save only, metadata saves on each field change. Extraction interacts with prose saves on the source side:

- `Cut` (and future `Link`) modifies the source body programmatically. This modification is treated as a user-initiated save: the source body is persisted as part of the extraction operation. The user does not need to press Save separately.
- `Keep` leaves the source body untouched. If the user had unsaved prose edits beforehand, those edits remain unsaved after extraction. The existing swap-file mechanism handles crash recovery.

### Order of operations and atomicity

On Confirm, with `Keep`:

1. `POST` create new entity (key + body).
2. Success → close modal; `Switch` (navigate) or `Stay`.
3. Failure → surface error in modal; modal stays open; nothing changed.

On Confirm, with `Cut` (and future `Link`):

1. `POST` create new entity (key + body).
2. Success → `PATCH` source body (selection removed, or — future — replaced with `[[type/key]]`). Optimistic UI applies the source edit immediately; rolls back on PATCH failure.
3. Both succeed → close modal; `Switch` or `Stay`.
4. Create fails → surface error in modal; modal stays open; selection still in source; no entity created.
5. Source update fails after create succeeded → **partial-success** state. The new entity exists. The modal closes with a toast: _"Created `{type}/{key}`. Couldn't update the source body — the selection is still there."_ The user can retry the source edit manually.

The create-first ordering is deliberate: a failed create leaves nothing changed; a failed source-update leaves a real entity and an unchanged source, which the user can reconcile, instead of a hole in the source body with no destination.

### Selection drift while the modal is open

Selection is captured by **text content**, not just offsets, at modal-open time. The source body may shift while the modal is open (an SSE-delivered external Obsidian edit, for example). On Confirm for `Cut`:

- Re-find the captured text in the current source body.
- If found at exactly one location, cut it there.
- If not found, surface _"Source body has changed; selection no longer matches"_ and keep the modal open. The user can re-open the modal after re-selecting, or proceed with `Keep` (effectively create-only).
- If found at multiple locations, treat as not-found by the same conservative rule.

### Action log

Extraction emits **one** entry to the per-project action log, capturing intent:

```json
{
  "type": "extract",
  "ts": "2026-05-21T14:23:11.482Z",
  "source": { "type": "fragment", "key": "scene-3", "uuid": "…" },
  "target": { "type": "note", "key": "the-river", "uuid": "…" },
  "options": { "sourceMode": "cut", "switch": true }
}
```

`sourceMode` is `keep` | `cut` | `link`. The downstream effects (file written; source file rewritten) are derivable and are not separately logged. If a future undo is added, a single log entry must reverse both effects atomically.

---

## Constraints

- Built on top of `command-palette.md`'s `useCommand` hook; the four extraction commands are not in the static registry.
- Selection is read from the editor's authoritative state (ProseMirror for Tiptap, EditorState for CodeMirror) — never from the browser's `window.getSelection`.
- Selection serialization uses the editor's existing markdown serializer. No new serialization path is introduced.
- Key validation reuses the existing per-type create validators. This feature MUST NOT introduce a parallel validation surface. If a shared validator does not yet exist across the four entity types, extracting one is a prerequisite for this feature.
- The two-step palette-then-modal pattern handed off here is the canonical pattern for any future command needing free-text input. The command palette's "closed-set arg pick only" rule stays inviolate.
- The action log records one entry per extraction. Multi-effect operations remain represented by intent, not by separate effect entries.
- The `Link` source-side mode is data-model-reserved but UI-disabled until `document-links.md` ships. When it ships, the default `sourceMode` flips from `cut` to `link`.

---

## Prior decisions

- **Arc is not an extraction target.** An arc is a list of control points stored as YAML, not a body. Extracting prose into an arc is a category error. The four valid targets are fragment, note, reference, aspect.
- **Four commands, not one with a type-pick step.** Discoverable by subsequence search ("extract to note" → palette finds it), and the four can each be hotkey-bound independently if needed. The cost — four catalog entries instead of one — is small in a deterministic, view-scoped section.
- **Modal owns the free-text input, not the palette.** The command palette's "no free-text argument" rule is kept intact; the palette command opens a separate modal for the key + options. This pattern is reusable for any future command needing free-text or multi-field input.
- **Three source-side modes; only two ship.** `Keep` / `Cut` / `Link`. `Link` is the eventual default and the canonical refactor move, but depends on `document-links.md` infrastructure. Shipping with `Cut` as default keeps the closest semantic to the eventual default; flipping later is a one-line change.
- **Cut as v1 default; Link as eventual default.** Most extractions are "promote this passage into its own entity"; the active default mirrors that intent.
- **Switch as default.** Extraction is a "this passage deserves to be its own thing" act; the natural next move is to develop the new entity. `Stay` is available for one-off footnote-style extractions.
- **Session-sticky toggles, not persisted.** Both toggles remember the last value in-memory. Per-action default-reset is annoying for batch refactors; project-level persistence would treat a transient preference as first-class config and clutter `project-config.md`.
- **Per-type key uniqueness.** Cross-type collisions are explicitly allowed by `_glossary.md` and `document-links.md`'s `[[type/key]]` form. Extraction does not invent a stricter rule.
- **Discarded fragments clash.** A discarded fragment still owns its key in the discarded namespace. Allowing a new fragment to take it leads to a confusing restore-time fight over the key. Block extraction with a specific reason.
- **Reuse existing validation.** Per-type create rules are the source of truth. No new validation surface. If a shared validator does not exist, extract one — but do not duplicate.
- **Live validation, server-authoritative.** The vault DB index supports cheap per-keystroke lookup; the modal exposes red/green state inline. The server-side `KEY_TAKEN` rejection is the authority on race conditions.
- **`unnamed-{type}-{n}` pre-fill, smallest unused n.** Enables a one-keystroke extract-and-rename-later flow. Smallest-unused avoids tripping its own live-validation on modal open.
- **Pre-fill is pre-selected.** macOS file-rename behavior — accept with Enter, or replace with any keystroke.
- **No category / readiness / weight fields in the modal.** Modal is a fast refactor surface, not an entity editor. Enrichment happens in the destination entity's normal editor after Switch.
- **No auto-placement of new fragments.** Extraction never places a fragment in any sequence. Placement is the overview's responsibility.
- **No block-snapping; literal selection.** The selection serializer's output is the new body. Orphan list items and partial paragraphs are accepted as-is; cleanup is the user's choice.
- **Trim outer whitespace; reject empty-after-trim.** Internal whitespace preserved verbatim.
- **Markdown out, regardless of source mode.** Tiptap serializes the slice; CodeMirror takes the substring. Either way the new body is markdown.
- **Cut on the source body is treated as a user-initiated save.** The editor's two-tier save contract applies — programmatic modification by a user action persists. `Keep` does not trigger a save.
- **Create-first ordering.** Failure on create rolls back cleanly to nothing. Failure on source-update leaves a recoverable partial state instead of a hole in the source body with no destination.
- **Capture selection by text content, not offsets.** Robust against SSE-delivered external edits arriving while the modal is open. Re-find on confirm; bail with a clear message if the text has moved or vanished.
- **One action-log entry per extraction.** Captures intent. Side effects are derivable. Future undo reverses both effects atomically.

---

## Open questions

- [ ] 2026-05-21 — Hotkey assignment, if any. Deferred until the feature is in user hands and the global-navigation hotkey scheme (see `command-palette.md` open question) lands.
- [ ] 2026-05-21 — When `document-links.md` ships and `Link` becomes the default, do we leave existing extracted-via-Cut sites as-is, or offer a one-time pass to convert them? Probably leave; conversion is destructive and the user can re-insert links manually.
- [ ] 2026-05-21 — Whether the modal should preview the new entity's first-time appearance (a small "this will create `notes/the-river`" hint with the resolved type path). Cheap to add; arguably overkill given the modal title already names the type.
- [ ] 2026-05-21 — Whether `unnamed-{type}-{n}` should be a configurable convention (e.g. project-level prefix). Not currently needed; flagged in case of friction.

---

## Acceptance criteria

- The palette surfaces four commands — `Extract to fragment…`, `Extract to note…`, `Extract to reference…`, `Extract to aspect…` — while a body editor (fragment / note / reference / aspect) is focused, and only then.
- The commands appear in the palette's view-scoped section under the `Editor` scope, ahead of global commands.
- Each command is disabled-with-reason `"Select text first"` when the editor's authoritative selection is empty or contains only whitespace.
- Triggering a command closes the palette and opens a modal scoped to the target type.
- The modal opens with the key textbox focused and pre-filled `unnamed-{type}-{n}`, with the pre-fill text pre-selected.
- `n` is the smallest positive integer such that no entity of the target type already uses `unnamed-{type}-{n}`. For target = fragment, discarded fragments are included in the namespace check.
- Live validation: typing in the key field updates a per-keystroke check against the vault DB index, debounced; the Confirm button is disabled while the key is empty, fails per-type validation rules, or clashes.
- Validation rules used are exactly those used by the corresponding existing create flow. No new rules.
- A key clashing with a discarded fragment surfaces the message _"A discarded fragment uses this key. Restore or rename it first."_
- A key clashing with a live entity of the same type surfaces a per-type clash message and disables Confirm.
- Cross-type keys do not clash: extracting to `notes/the-river` succeeds even if `aspects/the-river` exists.
- The modal exposes two toggles: source-side (`Keep` / `Cut`, with `Link` disabled until `document-links.md` ships) and next (`Switch` / `Stay`).
- The default source-side mode is `Cut`. The default next mode is `Switch`.
- Both toggles remember the most recent setting in-memory for the rest of the browser session and pre-select that setting on subsequent extractions.
- The selection is captured from the editor's authoritative selection state (ProseMirror for Tiptap, EditorState for CodeMirror); the browser selection is not consulted.
- The extracted body is the selection's markdown serialization. For Tiptap this means the editor's existing markdown serializer applied to the selection slice; for CodeMirror this means the raw substring.
- Leading and trailing whitespace are trimmed from the extracted body. If the trimmed body is empty, Confirm is disabled with reason _"Selection is empty"_.
- On Confirm with `Keep`: the server creates the new entity; on success, the modal closes and the app navigates (Switch) or remains (Stay). On failure, the modal stays open with an inline error.
- On Confirm with `Cut`: the server creates the new entity, then the source body is updated to remove the selection; on full success, the modal closes and the app navigates or remains.
- On Cut with a successful create but failed source update, the modal closes and a toast surfaces the partial-success state; the new entity exists, the source body is unchanged.
- On Cut, the source body update is treated as a save — the user does not need to press Save separately.
- On Keep, the source body is not modified and not saved by extraction; pre-existing unsaved edits remain unsaved.
- The new fragment, when target = fragment, is created with `readyStatus: 0`, empty aspect weights, empty notes/references, `isDiscarded: false`, and is not placed in any sequence.
- The new aspect, when target = aspect, is created with the selection as its description body and an empty category and empty notes.
- Notes, references, and aspects extracted from a fragment body are NOT auto-attached to the source fragment's metadata. (This behavior is owned by `document-links.md` and gated on `Link` mode.)
- Extraction emits one `extract` entry to the project action log, recording source entity, target entity, and the chosen options.
- If the source body has been changed externally while the modal is open (SSE-delivered) and the captured selection text is no longer findable in the current body, Confirm with Cut surfaces _"Source body has changed; selection no longer matches"_ and the modal stays open.
- `Esc` closes the modal and returns focus to the editor at its prior selection.
