# Spec: Extract Selection

**Status**: Draft
**Last updated**: 2026-05-21
**Shipped**:

- 2026-05-21 - extract to new fragment, Keep mode, Switch mode, from any entity body editor.
- 2026-05-21 — extract to new note, reference, or aspect; same Keep/Switch modal shape; per-type action-log entries (`note:extracted`, `reference:extracted`, `aspect:extracted`).
- 2026-05-21 - append/prepend selection to any existing entity (12 parameterized palette commands, `AppendOrPrependDialog` with Keep/Cut source-mode and Switch/Stay next-mode toggles, partial-success toast on cut failure, 8 API endpoints `POST /<entity>/{uuid}/{append,prepend}`). See `references/plans/extract-selection-2.md`.

---

## Outcome

The user can select a contiguous range of text inside any entity's body — fragment, note, reference, or aspect — and promote that selection into another entity of any of the same four types. The destination is either a **new** entity created on the spot, or an **existing** entity to which the selection is appended or prepended. The extract command opens a small modal that asks for the missing details (a key for new entities; nothing beyond the options for existing ones); on confirm, the destination reflects the selection and the source body is either left intact, cut, or (eventually) replaced with an inline link to the destination. Extraction is the canonical refactor move: it converts both "this passage deserves to be its own thing" and "this passage belongs over there" from a multi-step copy-create-paste-delete chore into a single user action.

---

## Scope

### In scope

- Twelve entry-point commands, four per direction, registered by the body editor and surfaced in the command palette:
  - `Extract to {fragment, note, reference, aspect}` — create a new entity from the selection.
  - `Append to {fragment, note, reference, aspect}` — append the selection to an existing entity.
  - `Prepend to {fragment, note, reference, aspect}` — prepend the selection to an existing entity.
- For append/prepend, the existing-entity target is picked via the palette's closed-set command-argument mechanism before the modal opens.
- A dedicated extraction modal per direction:
  - Extract-to-new: owns the key field, the source-side option, and the post-confirm option.
  - Append/prepend-to-existing: owns the source-side option and the post-confirm option only (no key field).
- Per-type uniqueness enforcement on the new key for extract-to-new, reusing existing per-entity create validation.
- Source-side options: `Keep` (selection stays verbatim) and `Cut` (selection removed). `Link` (selection replaced with `[[type/key]]`) is reserved but not shipped here; see `document-links.md`.
- Post-confirm options: `Switch` (navigate to the destination entity's editor) or `Stay` (remain on the source).
- A single action-log entry per extraction capturing source + target + options + target-side mode.

### Out of scope

- Arc as an extraction target. Arcs are sparse control-point YAML; there is no body to receive prose. See `aspect-arc-model.md`.
- Extraction from non-body surfaces: single-line metadata inputs (aspect category, fragment rename), the preview's assembled prose, the backlinks panel, the action log surface.
- Multi-range / disjoint-selection support. The editor selection APIs in use return a primary range; only that range is extracted.
- Preview as a source surface (would create cross-fragment extractions; no single source body to Cut from).
- Inline aspect creation from a fragment body with auto-tagging at weight > 0. The user must set meaningful weights separately, consistent with `document-links.md`.
- Sequence placement of the new fragment. Extraction never places. The overview / sequencer owns placement.
- Modal fields beyond the key (extract-to-new) + the two options. No category, no readiness, no initial aspect weights, no choice of insertion point within an existing target body (append/prepend only act at the boundaries). Enrichment and mid-body adjustment happen in the destination entity's normal editor.
- The `Link` source-side mode itself, until `document-links.md` ships. The option is reserved in the data model but not exposed in v1.

---

## Behavior

### Triggering

Twelve commands are registered by the shared body-editor component via the `useCommand` hook defined in `command-palette.md`:

| Command ID                    | Palette label         | Direction            |
| ----------------------------- | --------------------- | -------------------- |
| `editor.extract-to-fragment`  | Extract to fragment…  | Create new fragment  |
| `editor.extract-to-note`      | Extract to note…      | Create new note      |
| `editor.extract-to-reference` | Extract to reference… | Create new reference |
| `editor.extract-to-aspect`    | Extract to aspect…    | Create new aspect    |
| `editor.append-to-fragment`   | Append to fragment…   | Append to existing   |
| `editor.append-to-note`       | Append to note…       | Append to existing   |
| `editor.append-to-reference`  | Append to reference…  | Append to existing   |
| `editor.append-to-aspect`     | Append to aspect…     | Append to existing   |
| `editor.prepend-to-fragment`  | Prepend to fragment…  | Prepend to existing  |
| `editor.prepend-to-note`      | Prepend to note…      | Prepend to existing  |
| `editor.prepend-to-reference` | Prepend to reference… | Prepend to existing  |
| `editor.prepend-to-aspect`    | Prepend to aspect…    | Prepend to existing  |

All twelve appear in the palette's view-scoped section (top of the list) under the `Editor` scope while a body editor is focused. They are absent from the palette outside of a body editor.

No hotkey in v1; bindings may be added later via the command-system's declarative hotkey field.

### Choosing an existing target (append / prepend)

`Append to <type>` and `Prepend to <type>` use the palette's closed-set command-argument mechanism (per `command-palette.md`). After picking the command, the palette transitions into argument-pick mode:

- The argument set is **every live entity of the target type** in the current project, fuzzy-searchable by key.
- Discarded fragments are **excluded** from the argument set. Resurrecting content into a discarded container is incoherent; restore first if intended.
- The entity the user is currently editing is excluded from its own argument set (no self-append).
- Selecting an entity closes the palette and opens the append/prepend modal scoped to the chosen target.

If the target type has zero existing entities (e.g. a new project with no notes yet), the command is shown in the palette **disabled with reason** _"No `<type>`s to append to"_ / _"No `<type>`s to prepend to"_. Users should use `Extract to <type>` instead.

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

| Condition                          | Reason text            |
| ---------------------------------- | ---------------------- |
| Empty selection (cursor only)      | "Select text first"    |
| Selection contains only whitespace | "Select text first"    |
| No body editor focused             | _Command not surfaced_ |

Disjoint / multi-cursor selections are not expected to arise in Maskor's editor configuration; if they do, the command operates on `selection.main` only.

### The extract modal

Triggering the command closes the palette and opens a dedicated modal scoped to the chosen direction and target type.

**Extract-to-new modal** (`Extract to <type>`):

- A title naming the target type (`Extract to fragment`, etc.).
- A read-only preview of the selection (truncated if long).
- A **key** textbox, focused on open, with its content pre-selected.
- A **source** option (`Keep` · `Cut`). `Link` is reserved but disabled until `document-links.md` ships.
- A **next** option (`Switch` · `Stay`).
- A `Confirm` button and a `Cancel` button.

**Append/prepend modal** (`Append to <type>` / `Prepend to <type>`):

- A title naming the direction and target (e.g. `Append to note: the-river`).
- A read-only preview of the selection (truncated if long).
- A **source** option (`Keep` · `Cut`). `Link` reserved as above.
- A **next** option (`Switch` · `Stay`).
- A `Confirm` button and a `Cancel` button.

Both modals are focus-trapped. `Esc` cancels and returns focus to the editor. For the extract-to-new modal, Confirm is disabled until the key is non-empty, validates against the per-type rules, and does not clash. For the append/prepend modal, Confirm is enabled as soon as the modal opens — the target was already chosen via the palette argument and no further validation is needed.

### Key pre-fill

_Applies to extract-to-new only. Append/prepend has no key field._

The key field opens pre-filled with `unnamed-{type}-{n}`, where `n` is the smallest positive integer such that no entity of that type already has the key `unnamed-{type}-{n}`. For fragments, discarded fragments count toward the namespace (see Source-side behavior below for the rationale).

The pre-filled text is **pre-selected** so that:

- Pressing `Enter` immediately accepts the pre-fill and creates `unnamed-{type}-{n}`.
- Typing replaces the pre-fill in a single keystroke.

This is deliberately a fast-path: a writer mid-flow extracts a passage, accepts the disposable key, and renames the new entity later when the idea is clearer.

### Key validation

_Applies to extract-to-new only. Append/prepend skips this entire section: the target already exists and was picked from a closed set._

Validation is **per target type only** (cross-type collisions are permitted per `_glossary.md` and `document-links.md`). The rules are exactly the rules existing create flows (`createFragment`, `createNote`, `createReference`, `createAspect`) apply today; this feature must **not** introduce new validation. If the rules are not yet centralized in a shared validator, a refactor to extract one is the right path.

A key is considered clashing if any of the following exist within the target type's namespace:

- A live entity of that type with the same key.
- For fragments: a discarded fragment with the same key (`fragments/discarded/<key>.md`). The modal surfaces this with a specific reason: _"A discarded fragment uses this key. Restore or rename it first."_

Validation runs **live** as the user types, with a short debounce against the per-vault DB index. Confirm is disabled while the field is empty, invalid, or clashing. The server-side create remains authoritative: if a race causes the server to reject with `KEY_TAKEN`, the modal surfaces the error and stays open.

### Source-side behavior

Three source-side modes are defined; **two ship in v1**.

| Mode   | Effect on source body                                             | Shipped in v1 |
| ------ | ----------------------------------------------------------------- | ------------- |
| `Keep` | Selection unchanged. Source body is not touched.                  | Yes           |
| `Cut`  | Selection removed via the editor's native delete-range operation. | Yes           |
| `Link` | Selection replaced with `[[type/key]]` per `document-links.md`.   | No (reserved) |

`Cut` is the v1 default. When `document-links.md` ships and `Link` is unlocked, the default flips to `Link`.

The editor performs the deletion natively; no block-aware repair, no list-marker fix-up. If the cut leaves an orphan list item or an empty paragraph, the user cleans it up — consistent with hitting `Delete` themselves. The extracted text is whatever the selection serializer produces (markdown, in both editor families); no snapping to block boundaries.

### Per-target field population

_Applies to extract-to-new only._

The modal asks for `key` and the two options. Every other field on the new entity defaults to its create-time default. Specifically:

| Target    | Populated from extraction               | Defaulted                                                                                                                  |
| --------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Fragment  | `key`, `content` (= selection)          | `readyStatus: 0`, empty `aspects`, empty `notes`, empty `references`, `isDiscarded: false`, unplaced (not in any sequence) |
| Note      | `key`, body (= selection)               | Timestamps, UUID                                                                                                           |
| Reference | `key`, body (= selection)               | Timestamps, UUID                                                                                                           |
| Aspect    | `key`, body (= selection → description) | Empty `category`, empty notes                                                                                              |

Extraction never modifies any aspect-weight relationship on the source fragment. Notes/references/aspects extracted from a fragment body are not auto-attached as the fragment's metadata — that behavior is owned by `document-links.md` and is therefore tied to the (reserved) `Link` mode.

### Insertion behavior (append / prepend)

_Applies to append/prepend only._

The selection's markdown serialization is inserted into the target body's existing content. No other field on the target entity is touched (no metadata changes, no aspect-weight changes, no readiness changes).

- **Append**: target body becomes `<existing body>\n\n<inserted content>`.
- **Prepend**: target body becomes `<inserted content>\n\n<existing body>`.

The separator is a blank line (`\n\n`), giving a standard markdown paragraph break regardless of whether the inserted content or the existing body ends/starts on a block boundary. The user can clean up the join in the target editor after Switch.

If the target body is empty (or whitespace-only), no separator is inserted; the target body becomes the inserted content verbatim.

For aspect targets, "body" means the aspect's markdown description body — the same surface that hosts `Extract to aspect`. Category and other aspect fields are untouched.

### Switch vs Stay

Defaults differ by direction:

- **Extract-to-new**: `Switch` is the default. Promoting a passage into its own entity is a "now develop this new thing" move; the natural next step is the new entity's editor.
- **Append / prepend**: `Stay` is the default. The user is mid-flow in the source body and routed a passing thought to a tangential entity; staying respects the source-focused intent.

Both toggles (source-side and switch/stay) are **session-sticky per direction**: the last setting picked while doing an extract-to-new sticks for the next extract-to-new; the last setting picked while doing an append/prepend sticks for the next append/prepend. The two directions do not share state. They reset on browser reload and are not persisted to project config.

On `Switch`, the modal closes and the router navigates to the destination entity's editor route. For append/prepend, navigation lands on the target entity with no guarantee about scroll position; reaching the inserted content within the target body is the user's affordance.

### Save coupling with the source and the target

The body editor's existing save contract (per `fragment-editor.md`) is: prose saves on explicit Save only, metadata saves on each field change. Extraction interacts with prose saves on both ends:

- `Cut` (and future `Link`) modifies the source body programmatically. This modification is treated as a user-initiated save: the source body is persisted as part of the extraction operation. The user does not need to press Save separately.
- `Keep` leaves the source body untouched. If the user had unsaved prose edits beforehand, those edits remain unsaved after extraction. The existing swap-file mechanism handles crash recovery.
- For append / prepend, the **target** body modification is likewise treated as a user-initiated save: the new target body is persisted as part of the extraction operation. The user does not need to press Save in the target editor (even if they `Switch` to it afterwards).

### Order of operations and atomicity

**Extract-to-new, `Keep`:**

1. `POST` create new entity (key + body).
2. Success → close modal; `Switch` (navigate) or `Stay`.
3. Failure → surface error in modal; modal stays open; nothing changed.

**Extract-to-new, `Cut` (and future `Link`):**

1. `POST` create new entity (key + body).
2. Success → `PATCH` source body (selection removed, or — future — replaced with `[[type/key]]`). Optimistic UI applies the source edit immediately; rolls back on PATCH failure.
3. Both succeed → close modal; `Switch` or `Stay`.
4. Create fails → surface error in modal; modal stays open; selection still in source; no entity created.
5. Source update fails after create succeeded → **partial-success** state. The new entity exists. The modal closes with a toast: _"Created `{type}/{key}`. Couldn't update the source body — the selection is still there."_ The user can retry the source edit manually.

The create-first ordering is deliberate: a failed create leaves nothing changed; a failed source-update leaves a real entity and an unchanged source, which the user can reconcile, instead of a hole in the source body with no destination.

**Append / prepend, `Keep`:**

1. `PATCH` target body (insert selection at end / start with the separator rules above).
2. Success → close modal; `Switch` or `Stay`.
3. Failure → surface error in modal; modal stays open; nothing changed.

**Append / prepend, `Cut` (and future `Link`):**

1. `PATCH` target body (insert selection).
2. Success → `PATCH` source body (selection removed, or — future — replaced with `[[type/key]]`). Optimistic UI applies the source edit immediately; rolls back on PATCH failure.
3. Both succeed → close modal; `Switch` or `Stay`.
4. Target update fails → surface error in modal; modal stays open; selection still in source; target unchanged.
5. Source update fails after target succeeded → **partial-success** state. The target now contains the inserted content. The modal closes with a toast: _"Added to `{type}/{key}`. Couldn't update the source body — the selection is still there."_ The user can retry the source edit manually.

The target-first ordering mirrors the create-first ordering: a failed target-update leaves nothing changed; a failed source-update leaves a recoverable partial state (content present in both places) instead of content lost from the source with no destination.

### Selection drift while the modal is open

Selection is captured by **text content**, not just offsets, at modal-open time. The source body may shift while the modal is open (an SSE-delivered external Obsidian edit, for example). On Confirm for `Cut`:

- Re-find the captured text in the current source body.
- If found at exactly one location, cut it there.
- If not found, surface _"Source body has changed; selection no longer matches"_ and keep the modal open. The user can re-open the modal after re-selecting, or proceed with `Keep` (effectively create-only).
- If found at multiple locations, treat as not-found by the same conservative rule.

### Action log

Extraction emits **one** entry to the per-project action log, following Maskor's `<entityType>:<verb>` convention (the `target` at the base of the entry is the entity that was created or modified; the source lives in the payload).

The first slice already ships `fragment:extracted`:

```json
{
  "id": "…",
  "timestamp": "2026-05-21T14:23:11.482Z",
  "actor": "user",
  "type": "fragment:extracted",
  "target": { "type": "fragment", "uuid": "…", "key": "scene-3-alt" },
  "payload": {
    "sourceType": "fragment",
    "sourceKey": "scene-3",
    "sourceUuid": "…",
    "sourceMode": "cut",
    "navigated": true
  },
  "undoable": false
}
```

The extension adds eleven sibling action types, mirroring the existing payload exactly:

| Direction | Action types                                                                                |
| --------- | ------------------------------------------------------------------------------------------- |
| Extract   | `fragment:extracted` (shipped), `note:extracted`, `reference:extracted`, `aspect:extracted` |
| Append    | `fragment:appended`, `note:appended`, `reference:appended`, `aspect:appended`               |
| Prepend   | `fragment:prepended`, `note:prepended`, `reference:prepended`, `aspect:prepended`           |

For all twelve, the `target` is the destination entity (newly created for `*:extracted`, the existing entity for `*:appended` / `*:prepended`), and the payload carries `sourceType` / `sourceKey` / `sourceUuid` / `sourceMode` / `navigated`. The downstream effects (target file written or rewritten; source file rewritten) are derivable and are not separately logged. If a future undo is added, a single log entry must reverse all effects atomically.

Three event types per target type (rather than one `*:extracted` with a `targetMode` field) matches the existing per-action enumeration in `ActionTypeSchema` — `fragment:note-attached` vs `fragment:note-detached` is the same convention.

---

## Constraints

- Built on top of `command-palette.md`'s `useCommand` hook; the twelve extraction commands are not in the static registry.
- Append / prepend commands use the palette's closed-set command-argument mechanism to pick the existing target entity. No free-text arg; the palette's "closed-set arg pick only" rule stays inviolate.
- Selection is read from the editor's authoritative state (ProseMirror for Tiptap, EditorState for CodeMirror) — never from the browser's `window.getSelection`.
- Selection serialization uses the editor's existing markdown serializer. No new serialization path is introduced.
- Key validation (extract-to-new) reuses the existing per-type create validators. This feature MUST NOT introduce a parallel validation surface. If a shared validator does not yet exist across the four entity types, extracting one is a prerequisite for this feature.
- Target-body modification (append / prepend) reuses the same body-update path that the body editor's explicit Save uses; no new write path is introduced.
- The two-step palette-then-modal pattern (with optional palette-argument pick in between) handed off here is the canonical pattern for any future command needing structured input.
- The action log records one entry per extraction. Multi-effect operations remain represented by intent, not by separate effect entries.
- The `Link` source-side mode is data-model-reserved but UI-disabled until `document-links.md` ships. When it ships, the default `sourceMode` flips from `cut` to `link` (for extract-to-new only — append/prepend already place the content at the destination, so Link would be the natural source-side companion there too).

---

## Prior decisions

- **Arc is not an extraction target.** An arc is a list of control points stored as YAML, not a body. Extracting prose into an arc is a category error. The four valid targets are fragment, note, reference, aspect.
- **Three directions × four types = twelve commands.** `Extract to <type>` (new), `Append to <type>` (existing), `Prepend to <type>` (existing). Each is independently subsequence-matchable ("prepend to note" finds the prepend-to-note command directly), each can be hotkey-bound independently, and each carries one clean verb. The alternatives — one omnibus command with a position toggle, or folding new/append/prepend behind a sub-arg — either dilute subsequence search or depend on multi-step palette args. The cost of twelve view-scoped catalog entries is acceptable; they only appear inside a body editor.
- **Append / prepend pick the target via palette argument, not modal.** The set of existing entities is closed, so the palette's closed-set arg mechanism handles it natively. Keeping the picker in the palette means the modal stays a thin options surface (no fuzzy list inside the modal), and the user's mental model stays "palette finds things; modal collects options."
- **Modal owns the free-text input (extract-to-new only), not the palette.** The command palette's "no free-text argument" rule is kept intact; the extract-to-new command opens a separate modal for the key + options. This pattern is reusable for any future command needing free-text or multi-field input.
- **Discarded fragments are excluded from append / prepend target sets.** Appending content to a discarded container resurrects half of it; the user should restore explicitly first, then append. Excluding from the palette argument set enforces this without a separate error path.
- **Self-append is disallowed.** The currently-edited entity is excluded from its own append/prepend target set. Appending a passage of yourself to the end of yourself is incoherent (and would conflict with the source-side `Cut` in particular).
- **Three source-side modes; only two ship.** `Keep` / `Cut` / `Link`. `Link` is the eventual default and the canonical refactor move, but depends on `document-links.md` infrastructure. Shipping with `Cut` as default keeps the closest semantic to the eventual default; flipping later is a one-line change.
- **Cut as v1 default; Link as eventual default.** Most extractions are "promote this passage into its own entity"; the active default mirrors that intent.
- **Switch as default for extract-to-new; Stay as default for append / prepend.** Extracting a passage into its own entity is a "now develop this new thing" act; the natural next move is the new entity's editor. Appending to an existing entity is a "park this thought over there" act; the natural next move is to keep writing where you were. Different defaults serve the actual intent of each direction.
- **Session-sticky toggles per direction, not persisted.** Toggles remember the last value in-memory, but the extract-to-new toggles and the append/prepend toggles are tracked independently — a `Stay` chosen for an append doesn't drag into the next extract-to-new (where `Switch` is the better default). Per-action default-reset is annoying for batch refactors; project-level persistence would treat a transient preference as first-class config and clutter `project-config.md`.
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
- **Create-first / target-first ordering.** Failure on the destination-side write (create-new, or append/prepend to existing) rolls back cleanly to nothing. Failure on source-update leaves a recoverable partial state (content present at destination, still present at source) instead of content lost from source with no destination.
- **Capture selection by text content, not offsets.** Robust against SSE-delivered external edits arriving while the modal is open. Re-find on confirm; bail with a clear message if the text has moved or vanished.
- **Blank-line separator for append / prepend; suppressed against empty body.** A blank line (`\n\n`) is the markdown-standard paragraph break and works regardless of whether either side ends/starts on a block boundary. Suppressing the separator when the existing body is empty avoids a stray leading newline in the freshly-not-empty entity. The user can adjust the join in the target editor after `Switch`.
- **No block-snapping or list-marker repair on the target side either.** Same rationale as the source side: the modal is a fast-path. If appending mid-list creates an awkward join, the user fixes it in the target editor.
- **One action-log entry per extraction. Direction encoded in the action type, not a payload field.** Twelve action types (`<targetType>:{extracted,appended,prepended}`) follow Maskor's existing `<entityType>:<verb>` convention rather than introducing a cross-cutting `extract` type with a discriminator field. Captures intent; side effects are derivable; future undo reverses all effects atomically. The shipped `fragment:extracted` payload (`sourceType`, `sourceKey`, `sourceUuid`, `sourceMode`, `navigated`) is reused verbatim across all twelve.

---

## Open questions

- [ ] 2026-05-21 — Hotkey assignment, if any. Deferred until the feature is in user hands and the global-navigation hotkey scheme (see `command-palette.md` open question) lands.
- [ ] 2026-05-21 — When `document-links.md` ships and `Link` becomes the default, do we leave existing extracted-via-Cut sites as-is, or offer a one-time pass to convert them? Probably leave; conversion is destructive and the user can re-insert links manually.
- [ ] 2026-05-21 — Whether the extract-to-new modal should preview the new entity's first-time appearance (a small "this will create `notes/the-river`" hint with the resolved type path). Cheap to add; arguably overkill given the modal title already names the type.
- [ ] 2026-05-21 — Whether `unnamed-{type}-{n}` should be a configurable convention (e.g. project-level prefix). Not currently needed; flagged in case of friction.
- [ ] 2026-05-21 — On `Switch` after append / prepend, should the target editor scroll to and visually highlight the just-inserted region? Useful for confirming what landed where, but requires the target editor to expose an "scroll to range" affordance. Defer until the feature is in use.
- [ ] 2026-05-21 — Append / prepend ordering of the entity argument list: alphabetical-by-key, most-recently-edited first, or open-tabs-first? Most-recently-edited mirrors how the user is likely to think about "the note I was just in"; alphabetical is the safer default until usage shows otherwise.
- [ ] 2026-05-21 — Whether `Link` for append / prepend should rewrite the source-side selection to `[[type/key]]` pointing at the existing target (the natural extension), or whether append/prepend should never combine with Link (the strict interpretation: Link is for new-entity creation only). Decide alongside `document-links.md`.

---

## Acceptance criteria

**Common to all twelve commands:**

- The palette surfaces twelve commands — four `Extract to <type>…`, four `Append to <type>…`, four `Prepend to <type>…` — while a body editor (fragment / note / reference / aspect) is focused, and only then.
- The commands appear in the palette's view-scoped section under the `Editor` scope, ahead of global commands.
- Each command is disabled-with-reason `"Select text first"` when the editor's authoritative selection is empty or contains only whitespace.
- The selection is captured from the editor's authoritative selection state (ProseMirror for Tiptap, EditorState for CodeMirror); the browser selection is not consulted.
- The extracted body is the selection's markdown serialization. For Tiptap this means the editor's existing markdown serializer applied to the selection slice; for CodeMirror this means the raw substring.
- Leading and trailing whitespace are trimmed from the extracted body. If the trimmed body is empty, Confirm is disabled with reason _"Selection is empty"_.
- `Esc` closes the modal and returns focus to the editor at its prior selection.
- Extraction emits one action-log entry per operation, using the `<targetType>:{extracted,appended,prepended}` action type matching the direction. The `target` field is the destination entity and the payload is `{ sourceType, sourceKey, sourceUuid, sourceMode, navigated }` — identical shape to the shipped `fragment:extracted`.
- If the source body has been changed externally while the modal is open (SSE-delivered) and the captured selection text is no longer findable in the current body, Confirm with `Cut` surfaces _"Source body has changed; selection no longer matches"_ and the modal stays open.

**Extract-to-new specifics:**

- Triggering an `Extract to <type>…` command closes the palette and opens a modal scoped to the target type.
- The modal opens with the key textbox focused and pre-filled `unnamed-{type}-{n}`, with the pre-fill text pre-selected.
- `n` is the smallest positive integer such that no entity of the target type already uses `unnamed-{type}-{n}`. For target = fragment, discarded fragments are included in the namespace check.
- Live validation: typing in the key field updates a per-keystroke check against the vault DB index, debounced; the Confirm button is disabled while the key is empty, fails per-type validation rules, or clashes.
- Validation rules used are exactly those used by the corresponding existing create flow. No new rules.
- A key clashing with a discarded fragment surfaces the message _"A discarded fragment uses this key. Restore or rename it first."_
- A key clashing with a live entity of the same type surfaces a per-type clash message and disables Confirm.
- Cross-type keys do not clash: extracting to `notes/the-river` succeeds even if `aspects/the-river` exists.
- The modal exposes two toggles: source-side (`Keep` / `Cut`, with `Link` disabled until `document-links.md` ships) and next (`Switch` / `Stay`). The default source-side mode is `Cut`. The default next mode is `Switch`.
- On Confirm with `Keep`: the server creates the new entity; on success, the modal closes and the app navigates (Switch) or remains (Stay). On failure, the modal stays open with an inline error.
- On Confirm with `Cut`: the server creates the new entity, then the source body is updated to remove the selection; on full success, the modal closes and the app navigates or remains.
- On Cut with a successful create but failed source update, the modal closes and a toast surfaces the partial-success state; the new entity exists, the source body is unchanged.
- On Cut, the source body update is treated as a save — the user does not need to press Save separately.
- On Keep, the source body is not modified and not saved by extraction; pre-existing unsaved edits remain unsaved.
- The new fragment, when target = fragment, is created with `readyStatus: 0`, empty aspect weights, empty notes/references, `isDiscarded: false`, and is not placed in any sequence.
- The new aspect, when target = aspect, is created with the selection as its description body and an empty category and empty notes.
- Notes, references, and aspects extracted from a fragment body are NOT auto-attached to the source fragment's metadata. (This behavior is owned by `document-links.md` and gated on `Link` mode.)

**Append / prepend specifics:**

- Triggering an `Append to <type>…` or `Prepend to <type>…` command transitions the palette into argument-pick mode for the existing target entity, drawn from the closed set of all live entities of that type in the current project.
- The argument set excludes discarded fragments and excludes the currently-edited entity itself.
- If the target type has no eligible entities, the command is shown disabled-with-reason _"No `<type>`s to append to"_ / _"No `<type>`s to prepend to"_.
- Picking a target from the argument list closes the palette and opens the append/prepend modal, scoped to the chosen direction and named with both the target type and the target's key in the title (e.g. `Append to note: the-river`).
- The append/prepend modal has no key field. Confirm is enabled as soon as the modal opens (subject to the common selection-non-empty rule).
- The modal exposes two toggles: source-side (`Keep` / `Cut`, with `Link` disabled until `document-links.md` ships) and next (`Switch` / `Stay`). The default source-side mode is `Cut`. The default next mode is `Stay`.
- The session-stickiness for the toggles is tracked **independently** from the extract-to-new toggles; a value chosen in one direction does not pre-select the other direction.
- On Confirm with `Keep`: the server appends or prepends the selection to the target body; on success, the modal closes and the app navigates (Switch) or remains (Stay). On failure, the modal stays open with an inline error.
- On Confirm with `Cut`: the server updates the target body, then the source body is updated to remove the selection; on full success, the modal closes and the app navigates or remains.
- On Cut with a successful target-update but failed source update, the modal closes and a toast surfaces the partial-success state; the target contains the inserted content, the source body is unchanged.
- The target body modification is treated as a save: after `Switch`, the target editor opens against the persisted new content; no Save button press is required in the target editor.
- Append inserts `\n\n<selection>` at the end of the existing target body; prepend inserts `<selection>\n\n` at the start. If the existing target body is empty or whitespace-only, the separator is suppressed and the target body becomes the selection verbatim.
- No fields on the target entity other than the body are modified. No metadata, no aspect weights, no readiness changes.
