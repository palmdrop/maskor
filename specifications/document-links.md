# Spec: Document Links

**Status**: Draft
**Last updated**: 2026-05-20

---

## Outcome

Users can write Obsidian-style `[[type/key]]` links inside any markdown body — fragments, notes, references — to connect their work without leaving the editor. Links are navigable in the Maskor UI and round-trip cleanly through Obsidian. Linking to a note, reference, or aspect from a fragment body auto-attaches it in the fragment's metadata. Backlinks let the user see every place an entity is referenced.

Comments are **no longer** part of this model: they are anchored blocks inside a fragment's Margin (`specifications/margins.md`, ADR 0007), not vault files linked from a fragment.

---

## Scope

### In scope

- Inline `[[type/key]]` and `[[type/key|display alias]]` link syntax in any markdown body
- Link sources: fragment, note, and reference bodies
- Link targets: fragments, notes, references, aspects (all vault-file-backed)
- Editor experience: `[[` autocomplete, command-palette "Insert link" action, click-to-navigate, broken-link styling
- Autocomplete and click-to-navigate in raw markdown mode and vim mode (not only rich mode)
- Persisted link table (forward + backward edges) maintained by the watcher and API
- Backlinks UI surface on each entity page
- Auto-sync from inline links into fragment metadata (notes, references, aspects)
- Rename cascade: renaming any linkable entity rewrites links in every referring body, preserving aliases
- Delete behaviour: warn, strip from metadata, leave dead link in body
- External (Obsidian) edits parsed by the watcher; unresolved targets persisted

### Out of scope

- Anchor / block references: `[[note#heading]]`, `[[note#^block-id]]`
- Inline creation of new entities from a broken link (deferred — future feature)
- Embeds / transclusion (`![[…]]`)
- Subfolders inside entity-type folders (`notes/<subfolder>/<key>.md` is not supported)
- Sequencing constraints derived from links (deferred — future feature)
- Link-graph visualization or analytics view
- Comments — owned by `specifications/margins.md` + ADR 0007; comments are anchored Margin blocks, not document-links
- The `fragment.notes` / `fragment.references` API field shape itself (see "Coherence with metadata form" below — implementation detail for the migration plan)

---

## Behavior

### Syntax

- Canonical form: `[[type/key]]` — e.g. `[[notes/setting-notes]]`, `[[aspects/the-river]]`, `[[fragments/chapter-1-opening]]`.
- Alias form: `[[type/key|display text]]` — the alias is the rendered label; the target is unchanged.
- No file extension. Maskor follows Obsidian's bare convention.
- Maskor **always inserts** the full `type/key` path. This makes the target type unambiguous and survives future name collisions across types.
- The parser accepts both bare names (`[[the-river]]`) and full paths (`[[aspects/the-river]]`) for compatibility with externally-authored content. Bare names resolve using Obsidian's shortest-path-possible rule.

### Linkable entity types

| Type         | Vault folder  | Linkable | Inline-creates metadata attachment                                            |
| ------------ | ------------- | -------- | ----------------------------------------------------------------------------- |
| `fragments`  | `fragments/`  | Yes      | No (fragments are not attached to other fragments via metadata)               |
| `notes`      | `notes/`      | Yes      | Yes (added to fragment's note list at weight n/a)                             |
| `references` | `references/` | Yes      | Yes (added to fragment's reference list)                                      |
| `aspects`    | `aspects/`    | Yes      | Yes (added at weight 0; user must use the metadata form to set a real weight) |

Subfolders inside these directories are not supported. The filename stem remains the unique key within each type.

### Editor experience

- Typing `[[` opens an autocomplete popup listing all linkable entities project-wide. Items are grouped or labelled by type. Selecting an item inserts `[[type/key]]`.
- A command-palette command **Insert link** also opens an entity picker; on confirmation, the link is inserted at the editor's current cursor position. The cursor position must be preserved across the modal lifecycle.
- Autocomplete is available in rich mode, raw markdown mode, and vim mode.
- Click-to-navigate is available in all three modes. Clicking (or the keyboard equivalent in vim) on a link navigates to the target entity's page.
- Resolved links render with a distinct style (entity-tag-like). Unresolved links render in a broken style with no actionable click target.
- Aliased links render the alias text but otherwise behave identically.

### Resolution

- A link `[[type/key]]` resolves to an existing entity iff a file `<vault>/<type>/<key>.md` exists at parse time.
- Bare-name links (`[[key]]`) resolve using Obsidian's rule: prefer the same folder; otherwise shortest unambiguous path.
- A resolved link carries a stable join to the entity's UUID for navigation and backlink queries.
- An unresolved link is persisted in the link table with `target_uuid = null` and the raw `target_type` + `target_key` strings preserved. It is rendered as broken in the editor.
- An unresolved link with an unrecognised entity type (e.g. `[[gibberish/foo]]`) is **not** treated as a link. It renders as plain text and is not stored in the link table.

### Auto-sync between inline links and fragment metadata

When a fragment is saved, its body is parsed and the link table is updated. Inline links from a fragment body to a note, reference, or aspect also drive the fragment's metadata:

- **Adding** an inline link in a fragment body adds the target to the corresponding metadata list on the next save:
  - Notes: added to the fragment's note list.
  - References: added to the fragment's reference list.
  - Aspects: added to the fragment's aspect map at weight `0`. The user must use the metadata form to set a meaningful weight.
- **Removing** an inline link from a fragment body does _not_ automatically remove the metadata attachment, with one exception:
  - Aspects with weight `0` and no remaining inline references are removed on save. Aspects with any weight > 0 are preserved (the user committed to them deliberately via the form).
- Multiple inline references to the same target count as a single attachment. The metadata entry is preserved as long as at least one inline reference remains.
- The metadata form's X-button is **disabled** for any attachment that has at least one inline link in the fragment body. The form shows a hint explaining that the link must be removed from the body first. (This behaviour is deliberately conservative — see Open Questions.)
- The aspect weight slider remains enabled regardless of inline link presence. Adjusting the slider does not affect inline links.

Auto-sync runs **on save**, not per keystroke. There is a brief, expected lag between typing a link and the metadata chip appearing in the form.

Note and reference bodies are also link sources, but they have no metadata-attachment concept. Their links contribute to the link table only.

### Rename cascade

- Renaming any linkable entity (fragment, note, reference, aspect) through Maskor atomically:
  1. Renames the vault file.
  2. Rewrites all inline `[[…]]` links in every body that referenced the old key.
  3. Preserves alias text: `[[notes/old-key|the manor]]` becomes `[[notes/new-key|the manor]]`.
  4. Updates the link table.
- Cascade applies to all body sources, not just fragments. Notes and references that reference the renamed entity are rewritten too.
- This extends Maskor's existing rename-cascade mechanism. Fragment renames previously did not cascade; with this spec they must.
- External renames (Obsidian rewriting a filename while Maskor is offline) cannot be tracked. On next watcher catch-up the old entity is missing and the new file is a new unknown entity. Inline links to the old key become unresolved. The user must repair manually. Consistent with the existing attachments-rename behaviour.

### Delete behaviour

- Deleting an entity that has inbound inline links shows a warning naming the affected source bodies.
- On confirmed delete:
  - The entity file is removed.
  - Metadata attachments that pointed to the deleted entity (in fragments) are stripped from the metadata.
  - **Inline links in source bodies are left intact** and become unresolved (rendered broken).
- Maskor never rewrites a body to remove a dead link. Cleanup is the user's responsibility.
- Future feature: an "offer to create" affordance on broken links. Since Maskor inserts full-path links, the target type is always known. Out of scope here.

### Backlinks

- Each entity page surfaces a **Backlinks** section listing every body that links to it.
- Backlinks are read from the persisted link table — not parsed at view time — so they appear instantly.
- Backlinks include the source entity's key, type, and an optional excerpt of surrounding context (snippet). The snippet detail is implementation-defined.
- Unresolved (broken) links to a not-yet-existing target do not contribute to anything visible until the target appears, at which point existing unresolved rows are bound to the new UUID and the new entity's backlinks panel is populated.

### External (Obsidian) editing

- The watcher re-parses any body changed externally and updates the link table accordingly.
- External edits that introduce a link to a non-existent target produce an unresolved row in the link table (`target_uuid = null`). They do not cause errors.
- Auto-sync of inline links to fragment metadata also fires for external fragment edits, on the next watcher cycle. The same rules apply (add on link present; aspect-weight-0 removal on last link gone).

---

## Constraints

- Entity-type folders are flat. No subfolders.
- All four entity types (fragments, notes, references, aspects) must be vault-file-backed at canonical paths (`<vault>/<type>/<key>.md`). Aspects already are (see `project-config.md`); fragments, notes, references already are (see `fragment-model.md`, `attachments.md`).
- The link table is a persisted, derived index. Vault files are authoritative. The watcher must keep the index coherent with body content at all times.
- Canonical insertion form: full path `type/key`, no `.md` extension, no bare names. The parser accepts bare names and `.md`-suffixed variants for compatibility, but Maskor-authored links use the canonical form.
- The ProseEditor extension must work identically in rich, raw markdown, and vim modes for: autocomplete on `[[`, click-to-navigate, and broken-link rendering.
- Rename cascade must be atomic across the rename target's file, the link table, and all body files containing referring links. Existing rename-cascade infrastructure (notes, references, aspects) is the baseline; fragment rename cascade is new work.
- Auto-sync from inline links to fragment metadata fires **on save only**, not per keystroke.
- Maskor never rewrites a body file to remove dead links on delete.
- Aliases are preserved across rename. The alias text is user content; only the target portion is mutated.

---

## Prior decisions

- **Inline link syntax follows Obsidian conventions exactly**: `[[type/key]]` and `[[type/key|alias]]`, no `.md` extension. Round-trip compatibility with Obsidian is mandatory.
- **Full-path-only canonical form**: Maskor always inserts `type/key`, never bare. This disambiguates target type immediately, prevents future collisions across types from breaking existing links, and lets broken-link UI know what kind of entity is missing.
- **Aspects are linkable but weight management stays in the metadata form**: An inline `[[aspects/foo]]` attaches the aspect at weight 0. The user must use the metadata form to set a real weight. Inline-link syntax has no room for a weight value; trying to encode one would either collide with Obsidian alias syntax or invent a Maskor-only dialect that breaks round-trip.
- **Inline links auto-add to fragment metadata; removal does not auto-remove (notes/refs)**: For notes and references, attachments added through the metadata form must survive incidental edits to the body. Asymmetric add/remove protects user-curated attachments from silent destruction.
- **Aspect weight-0 cascade removal**: An aspect at weight 0 with no remaining inline references is removed on save. Weight 0 is treated as "uncommitted." Any non-zero weight is preserved regardless of inline state. This was a deliberate choice over a separate `origin` field on attachments — see Open Questions.
- **Form X-button disabled while inline links exist**: Removing a chip via the form while the body still links inline would re-add it on the next save (loop) or require Maskor to rewrite the body (destructive). Disabling the form X with an explanatory hint is the only honest option. Acknowledged as somewhat unintuitive — flagged for reconsideration.
- **Alias preserved across rename**: Renaming `notes/old-key` to `notes/new-key` rewrites `[[notes/old-key|the manor]]` to `[[notes/new-key|the manor]]`. The alias is user-authored display text and must survive.
- **Unresolved links are persisted**: A `[[notes/does-not-exist]]` row sits in the link table with `target_uuid = null`. When the target is later created, the row is bound. This supports useful project-wide broken-link queries.
- **Unrecognised types are not links**: `[[gibberish/foo]]` (where `gibberish` is not a known entity type) is plain text. It does not enter the link table.
- **Comments live in the Margin, not as document-links** (supersedes the earlier "comments are not anchor-scoped" decision): Comments are now anchored blocks inside a fragment's Margin (`specifications/margins.md`), bound to a block by a trailing marker — not standalone files linked via `[[comments/…]]`. Anchoring is the whole point of commenting; the file-per-comment model could not express it. See ADR 0007. Anchor/block references in document-link syntax (`[[note#heading]]`) remain out of scope; ordinary links still point at a file, not a position.
- **Autocomplete and click-to-navigate work in all editor modes**: Including raw markdown mode and vim mode. The link UX must not degrade when users opt into a lower-level edit mode.
- **Backlinks UI is fed from a persisted link table**: Computed on-demand from a full body scan would be too slow for large projects. The watcher is already the right place to maintain a body-derived index, so it gains one more table.
- **Subfolders are not supported inside entity-type folders**: Filename collisions across folders are not allowed within the same type. Only cross-type collisions (e.g. `notes/the-river` vs `aspects/the-river`) are permitted, which is exactly what the full-path form disambiguates.

---

## Open questions

- [ ] 2026-05-20 — **Form X-button cascade behaviour**: currently spec'd as disabled while inline links exist. This is conservative but mildly unintuitive ("why can't I remove this chip?"). Reconsider once the feature is in user hands. Alternatives to revisit: track an `origin` field per attachment so form-X can remove form-origin entries without touching inline ones; or have form-X strip the inline link from the body (destructive but consistent).
- [ ] 2026-05-20 — **Broken-link "offer to create"**: deferred. Since Maskor inserts full-path links the target type is always known on broken links, so this affordance is feasible. (Comments are no longer a candidate trigger — they live in the Margin now, not as inline-created files. See ADR 0007.)
- [ ] 2026-05-20 — **Backlink snippet detail**: should the backlinks panel show just the source key, or also a contextual excerpt around the link? Excerpts are more useful but cost extra parsing/storage. Pick after a basic implementation is live.
- [ ] 2026-05-20 — **Watcher catch-up performance at scale**: a project with many bodies and many cross-references will rebuild the link table from scratch on a full sync. Acceptable for greenfield. If projects grow large, an incremental rebuild strategy may become necessary.
- [ ] 2026-05-20 — **Sequencing constraints from links**: explicitly deferred. A user-authored `[[fragments/foo]]` link could later be interpreted as "this fragment should come near foo" or "before/after foo." Tracked as a future direction; not part of this spec.

---

## Acceptance criteria

- Typing `[[` in a fragment, note, or reference body opens an autocomplete listing all linkable entities project-wide, grouped or labelled by type.
- Selecting an entity from autocomplete inserts a link in canonical full-path form (`[[type/key]]`).
- The command-palette "Insert link" action opens an entity picker and inserts a link at the editor's current cursor position; the cursor returns to the position after the inserted link.
- Autocomplete, command-palette insertion, and click-to-navigate behave identically in rich mode, raw markdown mode, and vim mode.
- An inline `[[notes/foo]]` in a fragment body causes `notes/foo` to appear as an attached note in the fragment's metadata form after the next save.
- An inline `[[aspects/bar]]` in a fragment body adds `bar` to the fragment's aspect map at weight `0` after the next save.
- An inline `[[references/baz]]` in a fragment body adds `baz` to the fragment's reference list after the next save.
- Inline links from note and reference bodies do not modify any fragment metadata; they appear in the link table and contribute to backlinks only.
- Removing the last inline `[[aspects/bar]]` reference from a fragment body removes `bar` from the fragment's aspect map iff the weight is `0`. Non-zero weights are preserved.
- Removing the last inline `[[notes/foo]]` reference from a fragment body does **not** remove `foo` from the fragment's note list. The form X-button is the only way to detach.
- The metadata form's X-button is disabled (with hint) for any attachment that currently has at least one inline link in the fragment body.
- Renaming a note from `old-key` to `new-key` atomically: renames the vault file, rewrites every `[[notes/old-key]]` and `[[notes/old-key|<alias>]]` in every fragment, note, and reference body, preserves all aliases, and updates the link table.
- Renaming a fragment performs the same atomic cascade across all referring bodies. (Net-new: fragment renames previously did not cascade.)
- Deleting an entity that has inbound inline links shows a warning naming the affected source bodies.
- On confirmed delete, the entity's file is removed, metadata attachments pointing to it are stripped from fragments, and inline links in source bodies remain — rendered as broken.
- A `[[type/key]]` link to a non-existent target is persisted in the link table with `target_uuid = null` and a captured `target_type` + `target_key`. When an entity matching that type+key is later created, the link row binds to its UUID and the new entity's backlinks panel includes the now-resolved source.
- An inline `[[gibberish/foo]]` (unknown type) is not persisted in the link table and renders as plain text.
- Each entity page renders a backlinks panel listing every body that links to it. The panel is populated instantly from the link table — no full-project scan at view time.
- Inline links survive a full sync cycle: vault → DB → vault round-trip preserves canonical link form and aliases byte-for-byte.
- An externally-authored bare-name link (`[[the-river]]`) resolves the same way Obsidian does (shortest-path-possible rule); the link table records the resolved target.
- An externally-authored link to a non-existent target is captured as an unresolved row by the watcher; no errors are produced.
