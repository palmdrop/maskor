# Spec: Attachable Vault Documents

**Status**: Stable
**Last updated**: 2026-04-27

**Shipped**:

- 2026-04-05 — Notes and references are stored as vault markdown files; Maskor reads and writes their frontmatter (UUID, key, createdAt, updatedAt) without touching body content. (plan: references/plans/storage-markdown-reader.md)
- 2026-04-10 — Notes and references are indexed in a per-vault SQLite database; the index is rebuilt on demand and kept live by the file watcher. (plan: references/plans/vault-content-index.md)
- 2026-04-15 — Notes and references can be created and deleted via API; deletion hard-removes both the vault file and the DB row. (plan: references/plans/aspects-notes-references-crud.md)
- 2026-04-30 — Renaming a note or reference through Maskor atomically renames the vault file and propagates the key change to all referencing fragment frontmatter; no orphan warnings are produced. (plan: references/plans/project-config-page.md)
- 2026-05-09 — Attaching or detaching a note/reference from a fragment is committed immediately (optimistic UI, 400ms debounce) and recorded in the action log. (plan: references/plans/entity-live-metadata-save.md)
- 2026-05-27 — Notes and references can be assigned a category (slash-separated path) from their respective editors; changing the category moves the vault file and is reflected immediately in the config lists (grouped) and the fragment attachment picker (grouped). Category autocompletes from existing categories of that entity type. Client-side validation mirrors the API rules. (plan: references/plans/entity-subfolders.md)

---

## Outcome

Users can create named, free-text vault documents — notes and references — and attach them to fragments. Both types share an identical structure; the distinction between them is semantic and product-level only. This spec defines the shared rules. See `notes.md` and `references.md` for type-specific purpose and naming.

---

## Scope

### In scope

- Identity, lifecycle (create, read, rename, delete) for notes and references
- Vault storage and DB sync
- Attaching and detaching from fragments
- Handling orphaned attachments (vault file deleted; fragment still references it)
- Frontmatter schema

### Out of scope

- Attaching to entities other than fragments (aspects, arcs, sequences, projects) — acknowledged future scope; not built here
- Rich formatting, embeds, attachments within body content
- Search or filtering
- Linking notes or references to each other
- Citation formatting or bibliography generation for references
- AI-assisted generation

---

## Behavior

### Structure

A note or reference is a named, free-text document. It has:

- A **key** — the filename stem and the canonical identifier; there is no separate key field in frontmatter.
- A **UUID** — assigned on first detection, stable across renames.
- **`createdAt`** and **`updatedAt`** timestamps — managed by Maskor.
- **Body content** — free-form markdown. No schema.

Vault path: `notes/<key>.md` or `references/<key>.md`.

Frontmatter schema: UUID, key, `createdAt`, `updatedAt`. Body is free-form.

### Lifecycle

- **Creation**: user creates via the UI; a vault file is written immediately.
- **Editing**: user edits the body via the UI or directly in Obsidian. Maskor never modifies body content.
- **Rename via Maskor**: Maskor atomically renames the vault file and updates all fragment frontmatter lists that referenced the old key to the new key. No orphan warnings. This is the expected path — renames through Maskor are safe.
- **Rename externally** (Obsidian or filesystem, while Maskor is not running): Maskor has no way to correlate the old and new filename. On next startup, the old key is missing (orphan warnings on all fragments that referenced it) and the new file is a new unknown entity. The user must re-attach manually.
- **Deletion**: moves the vault file to a trash folder (`<vault>/.maskor/trash/<type>/<key>-<short-uuid>.md`) instead of hard-deleting it. If the document is attached to any fragment at deletion time, Maskor warns the user before proceeding. Fragment frontmatter lists are not auto-updated — orphaned references persist and produce sync warnings on the next rebuild. The trashed file is the recoverable artifact; restoring is a manual filesystem move (or a future "Restore" affordance, out of scope here). The trash folder is not indexed by the DB and is excluded from sync.

### Attaching to fragments

- A fragment's frontmatter contains lists of note and reference keys it is linked to.
- The fragment owns the relationship. Notes and references carry no back-reference to the fragment.
- Only documents that already exist in the vault can be attached. Creating inline from the fragment editor is out of scope for the initial implementation.
- The same note or reference can be attached to multiple fragments.
- Detaching removes the key from the fragment's frontmatter list. The document file is unaffected.

### Orphaned attachments

- If a key in a fragment's frontmatter no longer resolves to a file, the attachment is orphaned.
- Maskor surfaces this as a sync warning on rebuild.
- Maskor never rewrites fragment files to remove orphaned entries.
- The user must either restore the document or manually remove the entry from the fragment.

---

## Constraints

- Notes are in `<vault>/notes/`. References are in `<vault>/references/`. File names must be unique within each directory.
- The filename stem is the canonical key and the join between a fragment's frontmatter and the document. There is no UUID-based join and no separate key field in frontmatter.
- Body content is never modified by Maskor.
- The DB holds a derived index; the vault file is always authoritative.

---

## Prior decisions

- **Fragment owns the relationship**: Fragment frontmatter lists keys; documents carry no back-reference. The fragment is the structured entity; notes and references are attachments.
- **Filename stem as join key, not UUID**: The filename stem is the canonical key; fragment frontmatter stores it directly. Human-readable keys keep vault files legible in Obsidian without Maskor.
- **Maskor-initiated renames propagate automatically**: When the user renames a note or reference through Maskor, all fragment frontmatter references are updated atomically. No orphan warnings.
- **External renames produce orphan warnings**: Maskor cannot detect a filesystem rename as such. External renames result in the old entity becoming orphaned. The user must re-attach. This is the cost of editing outside Maskor while it is not running.
- **Notes and references are distinct types at the product level**: Despite identical structure, the semantic distinction (internal thought vs. external source) is preserved in naming and UI placement. The shared implementation does not merge the two into a single entity type.
- **Deletion warns if attached**: Before deleting a document referenced by any fragment, Maskor shows a warning. The user can confirm or cancel.
- **Trash folder instead of hard delete**: Deletion moves the file to `<vault>/.maskor/trash/<type>/`. Recovery from accidental deletion is then a filesystem operation rather than a "restore from a draft" operation. Retention policy, automated purge, and an in-app Restore surface are out of scope for this iteration — surfaced as an open question once trashed-file accumulation becomes observable.
- **Multi-fragment attachment is permitted**: The same document can be attached to any number of fragments.

---

## Acceptance criteria

- A document created via the API appears as a markdown file at the correct vault path.
- A document's UUID does not change on rename.
- Renaming a document via Maskor updates all fragment frontmatter references to the new key atomically. No orphan warnings are produced.
- Renaming a document externally (outside Maskor) and triggering a rebuild produces a sync warning for any fragment that referenced the old key. Fragment files are not modified.
- Deleting a document that is referenced by at least one fragment produces a warning before deletion proceeds.
- Deleting a document moves the vault file into `<vault>/.maskor/trash/<type>/<key>-<short-uuid>.md` rather than removing it from disk. The trash folder is not indexed by the DB and is excluded from sync.
- Deleting a document and triggering a rebuild produces a sync warning for any fragment that referenced it. Fragment files are not modified.
- Only document titles/names that exist in the vault can be attached to a fragment.
- The same document can be attached to multiple fragments simultaneously.
- Detaching a document from a fragment removes the key from the fragment's frontmatter list. The document file is unchanged.
