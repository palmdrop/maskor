# Spec: Storage Sync

**Status**: Stable
**Last updated**: 22-04-2026

---

## Outcome

The storage layer keeps vault markdown files and the SQLite index in sync at all times. External file edits are detected and indexed automatically; changes made via the Maskor API are reflected in the index immediately without waiting for the watcher. The vault is always the source of truth — the DB is always fully re-derivable from it.

The core idea is to have a database for quick lookups and queries, but keep all core project data in human-readable vault files where possible. Sequences are stored in `<vault>/.maskor/sequences/`; interleaving config in `<vault>/.maskor/config/`. These are Maskor-managed and not subject to watcher sync.

---

## Scope

### In scope

- Vault read/write for fragments, aspects, notes, references
- Full rebuild: O(n) vault scan → single SQLite transaction
- Incremental watcher sync (chokidar → per-file upsert)
- UUID assignment on first entity detection
- Drift and duplicate detection; missing keys or files, and duplicates, are detected.
- Inline DB update on API writes (closes stale-index window immediately)
- SSE change event emission after each watcher transaction
- Rebuild mutex: watcher paused or gated during rebuild
- Per-file piece consumption on `pieces/` add events

### Out of scope

- Sequences and sections — stored in `<vault>/.maskor/sequences/`, not subject to watcher sync
- Interleaving config — stored in `<vault>/.maskor/config/`, not subject to watcher sync
- Conflict auto-resolution — name conflicts require manual user action
- Aspect key drift auto-repair — Maskor never rewrites fragment files
- Multi-vault coordination
- Export

---

## Behavior

### Startup sequence

1. Middleware detects active project.
2. DB rebuild is triggered to make sure everything is in i sync.
3. Watcher starts — handles all changes from this point forward.

### Rebuild

- Full O(n) vault scan; all data held in memory; committed in a single SQLite transaction
- Entities absent from the vault are soft-deleted (`deletedAt` set to current timestamp)
- Fragments absent from vault are never hard-deleted — they are moved to `fragments/discarded/` and soft-deleted in DB
- Watcher must be paused or mutex-gated for the full duration of rebuild; a watcher upsert mid-rebuild would be overwritten by the stale in-memory snapshot on transaction commit

### Watcher (incremental sync)

- Chokidar watches vault root
- Watcher waits for writes to complete before sync
- Full-file hash guard (frontmatter + body) before every upsert; makes all watcher events idempotent for API-originated writes
- Entity routing by relative path prefix:

| Path prefix                         | Handling                                        |
| ----------------------------------- | ----------------------------------------------- |
| `fragments/`                        | sync fragment                                   |
| `fragments/discarded/`              | sync fragment (`isDiscarded` derived from path) |
| `aspects/`                          | sync aspect                                     |
| `notes/`                            | sync note                                       |
| `references/`                       | sync reference                                  |
| `pieces/`                           | per-file consume                                |
| `.maskor/`, `.obsidian/`, non-`.md` | ignored                                         |

- On `add` with missing UUID: write UUID to frontmatter, then upsert; the second watcher event from the write-back hash-guards to a no-op
- On `add` with colliding UUID: assign a new UUID, write back, log warning
- On `unlink`: soft-delete in DB; fragments are also moved to `fragments/discarded/`
- `pieces/` add: single-file consume — not batch `consumeAll`

### Aspect key resolution

- Aspect names/keys are unique
- Fragments are linked to aspects using their unique key
- Missing aspects are flagged
- Maskor never auto-rewrites fragment files to fix drift; user must rename the aspect or update the inline field in the fragment

### Name and file uniqueness

- File names must be unique within each vault subdirectory
- External edits can introduce duplicate names; Maskor surfaces the conflict and requires manual resolution — no auto-rename
- File name and the `title` frontmatter field are independent; renaming a file does not change `title`

### Conflict resolution

When Maskor and the user edit frontmatter concurrently, last-write-wins applies to all frontmatter fields. No merge or three-way diff — whichever write lands last becomes the DB state.

### Notes and References as vault entities

Notes (`notes/<title>.md`) and References (`references/<name>.md`) follow the same sync rules as fragments and aspects. Each gets a UUID assigned on first detection. Their frontmatter schema is defined in the codebase (see the shared schemas package); their body maps to a `content` field. Neither carries a back-reference to fragments — the fragment owns that relationship via its `notes` and `references` frontmatter arrays.

## Constraints

- Only operates on a single vault directory
- Database is stored in the `<vault>/.maskor` directory
- Fragment files are never auto-modified by Maskor for drift recovery
- Markdown format is Obsidian-compatible
- `<vault>/.maskor/` is Maskor-owned territory. The watcher ignores all files inside it. Maskor may overwrite any file there at any time. Users should not edit these files directly unless they know what they are doing.
- All other vault directories (`fragments/`, `aspects/`, `notes/`, `references/`, `pieces/`) are safe for the user to edit directly outside of Maskor. The watcher will pick up any changes.

---

## Prior decisions

- **Vault = source of truth, DB = derived cache**: Human-readable, Obsidian-compatible, survives DB loss. DB is re-derivable in full at any time from the vault.
- **Two databases**: Registry DB (`~/.config/maskor/registry.db`) is global; vault DB (`<vault>/.maskor/vault.db`) is per-vault and travels with the vault. No `project_uuid` column in vault DB.
- **Single transaction on rebuild**: Atomicity and batched disk flushes give consistent state and better performance than row-by-row commits.
- **Soft deletes only**: `deletedAt` on all DB rows; never hard-delete. Fragments additionally moved to `fragments/discarded/` on deletion.
- **Full-file hash guard**: Hash must cover frontmatter + body — hashing only the body would incorrectly skip the second watcher event after a UUID write-back.
- **No automatic file rewrites on drift**: Maskor surfaces `SyncWarning` for unresolved aspect keys; it does not auto-fix fragment files.
- **Aspect key as stable reference, not UUID**: Aspect names are unique within a vault, so `aspect_key` is sufficient as the join column in `fragment_properties`. A nullable `aspect_uuid` column adds resolution complexity without benefit — drift is captured equally well by checking whether the key exists in the aspects table.
- **Per-file piece consumption**: `vault.pieces.consume(filePath)` preferred over `consumeAll` for memory efficiency and incremental processing. A future queuing layer can be added if needed.
- **`version` field removed**: Served no user-facing purpose and added frontmatter noise. Removed entirely.
- **`isDiscarded` derived from path**: After pool concept removal, discarded state is determined solely by whether `filePath.startsWith("discarded/")`. No frontmatter field; no DB column that needs external input.
- **Watcher started in `resolveProject` middleware**: Side effect in middleware is acknowledged; deferred to a more explicit startup mechanism when project lifecycle management is formalised.

---

## Removed concepts

- **Pool** (`unprocessed`, `incomplete`, `unplaced`, `discarded`): The pool lifecycle concept was removed. Fragments no longer carry a `pool` field. References to pool in older plans (`vault-watcher.md`, `vault-content-index.md`, etc.) are historical. Do not re-introduce.
- **`aspect_uuid` in `fragment_properties`**: The `fragment_properties` table no longer has an `aspect_uuid` column. Fragment→aspect relationships are joined on `aspect_key`. References to `aspect_uuid` in older plans (`vault-content-index.md`, `vault-watcher.md`) are historical. Do not re-introduce.

---

## Open questions

- [x] 2026-04-22 — What value should `updatedAt` carry for files edited externally (where Maskor does not write back)? **Resolution** (2026-04-23): `fromFile` falls back to `new Date()` (sync time) when `updatedAt` is absent from frontmatter. For Obsidian-only edits, `updatedAt` in the DB reflects the time of sync rather than the user's edit time. Files without `updatedAt` in frontmatter never have it written back, so hash-guard prevents repeated upserts. Revisit if user-facing "last edited" timestamps become a product requirement.
- [ ] 2026-04-22 — Sequences/sections DB schema is deferred. When designed, storage-sync scope will expand to cover sequence sync rules.

---

## Acceptance criteria

- Full rebuild produces fragment/aspect/note/reference counts matching the vault file count
- An external file edit is reflected in the DB within ~250ms
- An API write is immediately reflected in the DB with no stale-index window
- A UUID is assigned and written back on first detection of any entity that lacks one
- Aspect key drift produces a warning; it does not block or abort sync
- Watcher and rebuild cannot run concurrently — the mutex is enforced
- Deleting a fragment file moves it to `fragments/discarded/` and soft-deletes the DB row
- `isDiscarded` is `true` for any fragment whose `filePath` starts with `discarded/`
- SSE events are emitted after each watcher transaction, not inside it
