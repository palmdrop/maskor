# Filename as sole source of truth for entity keys

**Date**: 03-05-2026
**Status**: Done
**Specs**: `specifications/storage-sync.md`

---

## Goal

The filename stem is the only authoritative key for notes, references, and aspects — `key:` is removed from frontmatter entirely, and vault file renames propagate automatically through the watcher cascade.

---

## Background

Currently, `key:` is written to and read from frontmatter for all three entity types. The filename and the frontmatter field must stay in sync manually. This redundancy causes two problems:

1. **API renames are fragile** — the storage service must update both the frontmatter field and rename the file, and the inline cascade code in `notes.update` / `references.update` is duplicated rather than shared.
2. **Watcher-driven renames are not detected** — if a user renames a note file directly in the vault (e.g. in Obsidian), `syncNote` just re-upserts with the old key still in frontmatter, so the DB key diverges from the filename.

Phase 6 (aspect rename via API) and Phase 6b (note/reference rename cascade) are already implemented inline in the storage service. This plan extracts them into shared helpers and wires up the watcher to call them on rename detection.

---

## Tasks

### Phase 1: Mapper changes

Drop the `key:` frontmatter field. The filename stem is the only source.

- [x] `noteMapper.fromFile`: derive `key` from `basename(filePath).replace(/\.md$/, "")` — remove frontmatter `key` lookup
- [x] `noteMapper.toFile`: remove `key` from frontmatter output
- [x] `referenceMapper.fromFile` / `toFile`: same as note
- [x] `aspectMapper.fromFile`: same — derive `key` from basename, remove frontmatter lookup
- [x] `aspectMapper.toFile`: remove `key` from frontmatter output

Existing vault files that have `key:` in frontmatter are silently ignored on read and stripped on next write. No vault migration needed.

### Phase 2: Extract cascade helpers

Pull the inline rename cascade logic out of `notes.update`, `references.update`, and `aspects.update` into reusable module-level helpers in `storage-service.ts`. The existing API update paths call these helpers unchanged — this is a pure refactor with no behavior change.

- [x] Extract `cascadeNoteKeyRename(context, oldKey, newKey)`: updates fragment and aspect vault files (`notes:` array) + `fragment_notes` / `aspect_notes` DB rows; returns `{ fragments: string[], aspects: string[] }`
- [x] Extract `cascadeReferenceKeyRename(context, oldKey, newKey)`: updates fragment vault files (`references:` array) + `fragment_references` DB rows; returns `{ fragments: string[] }`
- [x] Extract `cascadeAspectKeyRename(context, oldKey, newKey)`: updates fragment vault files (inline field key) + arc file (rename + `aspectKey` update) + `fragment_properties` DB rows; returns `{ fragments: string[] }`
- [x] Refactor `notes.update` to call `cascadeNoteKeyRename`
- [x] Refactor `references.update` to call `cascadeReferenceKeyRename`
- [x] Refactor `aspects.update` to call `cascadeAspectKeyRename`

### Phase 3: Watcher rename cascade

Add rename detection to `syncNote`, `syncReference`, and `syncAspect` in `watcher.ts`. A rename is detected when the DB already has a row for the incoming UUID but with a different key than the current filename stem.

- [x] `syncNote`: after parsing UUID, query DB by UUID; if row exists with a different `key` than the filename stem, call `cascadeNoteKeyRename(context, oldKey, newKey)` before upserting
- [x] `syncReference`: same pattern using `cascadeReferenceKeyRename`
- [x] `syncAspect`: same pattern using `cascadeAspectKeyRename`
- [x] Verify hash-guard behaviour: cascade helpers write vault files, which will re-trigger watcher `change` events; the hash-guard must skip these re-reads (content hash will be unchanged after the cascade write). Confirm with a test or manual check before shipping.

---

## Notes

The cascade helpers write vault files during a watcher handler. This is safe because the hash-guard in each `sync*` function skips files whose content hash matches the stored value — the re-triggered events will see the same hash and exit early.

`cascadeAspectKeyRename` is also called from `aspects.update` (the API path). The arc rename sub-step (read old arc, write new arc, delete old) is already inline in `aspects.update` — the helper should include it.

DO NOT IMPLEMENT until clearly stated by the developer.
