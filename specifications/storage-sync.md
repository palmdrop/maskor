# Spec: Storage Sync

**Status**: Stable
**Last updated**: 2026-06-01

**Shipped**:

- 2026-06-01 — Fault-tolerant rebuild + manual DB reset: `index.rebuild` reads each entity file independently — a single unparseable file is skipped (and recorded as an `INVALID_ENTITY_FILE` state warning, cleared when fixed, never rewritten) instead of aborting the whole rebuild; the watcher records/clears the same warning incrementally. A new `index.reset` storage operation + `POST /index/reset` route + **Reset database** button drop and re-derive the vault DB on demand (recovering from corruption/drift a rebuild can't fix), emitting a `vault:reset` SSE event. Rebuild and reset now surface success/failure in the UI instead of failing silently. (plan: references/plans/resilient-rebuild-and-db-reset.md)
- 2026-06-01 — Dev-only DB auto-reset on schema drift: `vault.db` and `registry.db` stamp a migration-journal fingerprint into `PRAGMA user_version`; with the opt-in `MASKOR_DB_AUTO_RESET` flag set, a fingerprint mismatch drops and recreates the DB clean on open (repopulated by the startup rebuild), removing the manual delete-db + restart + reload loop. Off by default. Spec invariant corrected to document `fragment_stats` telemetry and `UUID_COLLISION` warnings as non-re-derivable DB-only state. (plan: references/plans/dev-db-auto-reset.md)

- 2026-05-22 — Rebuild-in-progress loading state: concurrent requests all await the same rebuild promise; `GET rebuild-status` endpoint exposes in-progress state without blocking; fragment list, overview, and project-config views show "Rebuilding project index…" during rebuild. (plan: `scripts/ralph/archive/2026-05-22-small-improvements/`)
- 2026-04-04 — Vault change events are emitted over SSE after each watcher transaction; the frontend invalidates its cache automatically without polling. (plan: references/plans/sse-vault-events.md)
- 2026-04-05 — Fragments, aspects, notes, and references are stored as vault markdown files; Maskor reads and writes frontmatter without modifying body content. (plan: references/plans/storage-markdown-reader.md)
- 2026-06-01 — Margin storage. A fragment's Margin is a vault markdown file at `margins/<fragment-key>.md` (`fragmentUuid` + `createdAt`/`updatedAt` frontmatter; `## Notes` + `## Comments` body, comments serialized as `<!--c:ID-->` + `> excerpt` + body). Lazily created on first note/comment; persists when emptied (no auto-removal). The Margin follows its fragment through the lifecycle: rename cascades the filename, discard moves it to `margins/discarded/`, delete removes it alongside the fragment. `fragmentUuid` is the stable join. (plan: references/plans/margins.md)
- 2026-04-10 — All vault entities are indexed in a per-vault SQLite database; full rebuilds run as a single atomic transaction and soft-delete entities no longer present in the vault. (plan: references/plans/vault-content-index.md)
- 2026-04-15 — Piece files dropped into `pieces/` are consumed individually as they arrive; `updatedAt` is recorded in frontmatter across all vault entities. (plan: references/plans/storage-sync-spec-fixes.md)
- 2026-04-24 — Storage uses two separate databases: a global project registry and a per-vault database that travels with the vault and can be fully rebuilt from vault files at any time. (plan: references/plans/sessions-and-projects.md)
- 2026-04-24 — StorageService exposes only UUID-based operations; internal file-path routing is opaque to callers. (plan: references/plans/storage-service-encapsulation.md)
- 2026-05-04 — Filename stem is the sole authoritative key for all vault entities; the `key:` frontmatter field is removed. Watcher cascades rename propagation automatically. (plan: references/plans/filename-as-key-source-of-truth.md)
- 2026-05-07 — The watcher syncs individual vault files immediately after each change; a full-file hash guard makes all events idempotent, including API-originated writes. (plan: references/plans/vault-watcher.md)
- 2026-05-14 — Fragment discard state is derived entirely from filesystem location (`fragments/discarded/`); no frontmatter flag can drift out of sync. (plan: references/plans/remove-pool-concept.md)
- 2026-05-28 — The `pieces/` staging folder is removed. A raw `.md` dropped into `fragments/` is now the sole external-edit adoption path: on first detection the watcher mints a UUID and writes back complete canonical frontmatter (uuid, updatedAt, readiness, notes, references), preserving any fields the user supplied. (plan: references/plans/remove-piece-concept-and-vault-warnings.md)
- 2026-05-29 — Vault warnings store. Sync surfaces three warning kinds to a `vault_warnings` table: `WRONG_FORMAT_FILE` and `UNKNOWN_ASPECT_KEY` (state warnings, re-detected on every rebuild and cleared when fixed) and `UUID_COLLISION` (event warning, recorded by the watcher on a resolved collision and persisted until dismissed). The watcher updates warnings incrementally and emits a `vault:warning` SSE event on any change. (plan: references/plans/remove-piece-concept-and-vault-warnings.md)
- 2026-05-30 — Rebuild adopts on read: entity files lacking a frontmatter UUID are minted + written back during the scan (full canonical frontmatter for fragments, UUID-only for keyed entities) using the watcher's helpers, idempotently. This makes adopting an externally-prepared vault work end to end, since the watcher ignores the initial scan. `.maskor/sequences/` and `.maskor/config/` are created with the vault skeleton, and directory listers treat a missing directory as empty without logging an error. (plan: references/plans/vault-adoption-rebuild-metadata.md)

---

## Outcome

The storage layer keeps vault markdown files and the SQLite index in sync at all times. External file edits are detected and indexed automatically; changes made via the Maskor API are reflected in the index immediately without waiting for the watcher. The vault is always the source of truth — the DB is re-derivable from it via `index.rebuild`, **with two documented exceptions** (see "DB-only state" below): `fragment_stats` behavioral telemetry and `UUID_COLLISION` event warnings are canonical DB-only state, accumulated at runtime and stored in no vault file. A normal rebuild preserves them; a full DB drop discards them.

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
- Vault warning detection (wrong-format files, unknown aspect keys, resolved UUID collisions) recorded to a warnings store

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
2. DB rebuild is triggered to make sure everything is in sync. Concurrent requests on the same project wait for the same rebuild promise — only one rebuild runs per project per process lifetime.
3. Watcher starts — handles all changes from this point forward.

### Rebuild-in-progress UX contract

- During an in-progress rebuild, `GET /projects/:projectId/rebuild-status` returns `{ rebuilding: true }` immediately (no blocking).
- All other project-scoped API requests block until rebuild completes — they never return partial/empty data.
- The frontend polls `rebuild-status` on mount and shows a named loading state "Rebuilding project index…" in the fragment list, overview, and project-config views while `rebuilding: true`.
- When rebuild completes, the status endpoint returns `{ rebuilding: false }` and the frontend invalidates all project queries so views auto-refresh.

### Rebuild

- Full O(n) vault scan; all data held in memory; committed in a single SQLite transaction
- **Adoption on read**: during the scan, any entity file (fragment, aspect, note, reference) lacking a frontmatter UUID is adopted — a UUID is minted and written back to disk before the DB upsert, using the same helpers as the watcher. Fragments get full canonical frontmatter (uuid, updatedAt, readiness, notes, references); keyed entities get a UUID only (their other fields default at read time). The rewritten content's hash is what gets stored, so the follow-up watcher event hash-guards to a no-op. Files that already carry a UUID are left untouched on disk. This is what makes adopting an externally-prepared (e.g. Obsidian) vault work — the watcher ignores the initial scan, so rebuild is the only path that sees pre-existing files. Sequences are excluded (Maskor-owned, always written with a UUID).
- Adoption write-backs happen in the async read phase, before the transaction. Rebuild stays outside the vault write lock: the startup rebuild runs in `resolveProject` before any user write, and the restore-time rebuild runs inside `drafts.restore`, which already holds the lock.
- Entities absent from the vault are soft-deleted (`deletedAt` set to current timestamp)
- Fragments absent from vault are never hard-deleted — they are moved to `fragments/discarded/` and soft-deleted in DB
- Watcher must be paused or mutex-gated for the full duration of rebuild; a watcher upsert mid-rebuild would be overwritten by the stale in-memory snapshot on transaction commit

### Watcher (incremental sync)

- Chokidar watches vault root
- Watcher waits for writes to complete before sync
- Full-file hash guard (frontmatter + body) before every upsert; makes all watcher events idempotent for API-originated writes
- Entity routing by relative path prefix:

| Path prefix                        | Handling                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `fragments/`                       | sync fragment (root only)                                           |
| `fragments/discarded/`             | sync fragment (`isDiscarded` derived from path)                     |
| `fragments/<other-subfolder>/`     | rejected with warning — fragments are root-only beyond `discarded/` |
| `aspects/[<category>/]`            | sync aspect (category derived from subfolder path)                  |
| `notes/[<category>/]`              | sync note (category derived from subfolder path)                    |
| `references/[<category>/]`         | sync reference (category derived from subfolder path)               |
| non-`.md` under an entity folder   | recorded as a `WRONG_FORMAT_FILE` warning; not indexed              |
| `.maskor/`, `.obsidian/`, dotfiles | ignored                                                             |

- On `add` with missing UUID: write UUID to frontmatter, then upsert; the second watcher event from the write-back hash-guards to a no-op
- On `add` with colliding UUID for **fragments**: assign a new UUID, write back, log warning
- On `add` with same UUID at a different path (within the same entity-type subtree): treat as a move — update `filePath`, no cascade rename, no UUID change
- On `add` with a UUID recently removed from this entity-type table: emit the resulting `*:synced` event with `revived: true` (in-memory tracker per watcher instance, ~24h TTL); identity is preserved through the upsert regardless of whether the flag is set
- On `unlink`: rename-buffer correlates close-in-time renames/moves; on buffer expiry, the row is hard-deleted and the UUID is recorded in the recently-deleted tracker
- On a non-`.md` file added under an entity folder: record a `WRONG_FORMAT_FILE` state warning and emit `vault:warning`; on its `unlink`, clear that warning

### Move and revival lifecycle

- **Move within entity type, same key**: any combination of category/folder change is treated as a path update. No cascade, no new UUID. Identity preserved through the UUID in frontmatter.
- **Rename within entity type (key change)**: the rename-buffer correlates the unlink+add by UUID. Cascade rewrites every fragment frontmatter reference from the old key to the new.
- **Slow out-and-back return** (file removed, edited externally for longer than the rename-buffer window, then dropped back): the row is hard-deleted on buffer expiry. The returning add carries the original UUID from frontmatter; the upsert inserts a new row with that UUID. If the deletion is still within the in-memory recently-deleted tracker's window, the resulting `*:synced` event carries `revived: true`. See ADR-0002.
- **Cross-entity-type returns** (e.g. `aspects/x.md` → `notes/x.md`): not preserved as the same logical entity. The source-type row is hard-deleted; the destination-type entity is created with the UUID from frontmatter. Fragment frontmatter that referenced the original entity is left untouched and surfaces as a `SyncWarning` on the next rebuild (e.g. `UNKNOWN_ASPECT_KEY`).

### Aspect key resolution

- Aspect names/keys are unique
- Fragments are linked to aspects using their unique key
- Missing aspects are flagged
- Maskor never auto-rewrites fragment files to fix drift; user must rename the aspect or update the inline field in the fragment

### Vault warnings

Sync records warnings the user can inspect (surfaced on the project-config Diagnostics tab — see `specifications/project-config.md`). Four kinds, split into two categories:

- **State warnings** — re-detectable from the vault, cleared automatically when the underlying problem is fixed:
  - `WRONG_FORMAT_FILE` — a non-`.md`, non-dotfile sitting under an entity folder. Never auto-converted (conversion stays in the import pipeline).
  - `UNKNOWN_ASPECT_KEY` — a fragment references an aspect key that does not exist in the aspects table; aggregated per key with the set of referencing fragment UUIDs.
  - `INVALID_ENTITY_FILE` — an entity file that could not be parsed (e.g. malformed YAML frontmatter). It is skipped during indexing rather than aborting the whole rebuild, and is **never** rewritten (parsing must succeed before any adoption write-back). Keyed by vault-relative path; carries the entity kind and the parse error.
- **Event warnings** — recorded at the moment they occur, auto-resolved, persist until the user dismisses them, never re-derived on rebuild:
  - `UUID_COLLISION` — the watcher detected a fragment file whose UUID already belonged to another file, minted a new UUID, and wrote it back.

Rebuild is authoritative for state warnings: it deletes all state-warning rows then re-detects them in the same pass, while preserving event-warning rows. The watcher keeps state warnings current incrementally between rebuilds and records `UUID_COLLISION` events as they happen. Any warning-table change emits a `vault:warning` SSE event.

### Name and file uniqueness

- File names must be unique within each vault subdirectory
- External edits can introduce duplicate names; Maskor surfaces the conflict and requires manual resolution — no auto-rename
- File name and the `title` frontmatter field are independent; renaming a file does not change `title`

### Conflict resolution

When Maskor and the user edit frontmatter concurrently, last-write-wins applies to all frontmatter fields. No merge or three-way diff — whichever write lands last becomes the DB state.

### Notes and References as vault entities

Notes (`notes/<title>.md`) and References (`references/<name>.md`) follow the same sync rules as fragments and aspects. Each gets a UUID assigned on first detection. Their frontmatter schema is defined in the codebase (see the shared schemas package); their body maps to a `content` field. Neither carries a back-reference to fragments — the fragment owns that relationship via its `notes` and `references` frontmatter arrays.

Margins (`margins/<fragment-key>.md`, discarded under `margins/discarded/`) are read/written through the vault layer like other entities, but differ in two ways: the stable join to their fragment is `fragmentUuid` in frontmatter (not a UUID of their own), and the filename stem mirrors the **fragment's** key. The body is a `## Notes` section (free prose) plus a `## Comments` section (each comment serialized as `<!--c:ID-->` marker + `> excerpt` blockquote + body). Margins are lazily created on the first note/comment and persist once created. Their lifecycle is coupled to the fragment's rather than independent: a fragment rename/discard/delete cascades to the Margin file. Watcher sync and the DB index for margins/comments are defined in the DB-index behaviour below (shipped 2026-06-01, Phase 2 of the margins plan).

## Constraints

- Only operates on a single vault directory
- Database is stored in the `<vault>/.maskor` directory
- Fragment files are never auto-modified by Maskor for drift recovery
- Fragment subdirectories beyond `discarded/` produce sync warnings and are not indexed.
- Markdown format is Obsidian-compatible
- `<vault>/.maskor/` is Maskor-owned territory. The watcher ignores all files inside it. Maskor may overwrite any file there at any time. Users should not edit these files directly unless they know what they are doing.
- All other vault directories (`fragments/`, `aspects/`, `notes/`, `references/`) are safe for the user to edit directly outside of Maskor. The watcher will pick up any changes.

---

## Prior decisions

- **Vault = source of truth, DB = derived cache**: Human-readable, Obsidian-compatible, survives DB loss. DB is re-derivable from the vault at any time via `index.rebuild`, except for the DB-only state noted below.
- **DB-only state (not re-derivable)**: `fragment_stats` behavioral telemetry (`voluntaryOpenCount`, `promptAcceptCount`, `avoidanceCount`, `editCount`, `lastSurfacedAt`) and `UUID_COLLISION` event warnings exist only in the DB — no vault file carries them. `index.rebuild` preserves them (stats via `onConflictDoNothing`; event warnings are never wiped), but a full DB drop loses them. This is why the dev-only auto-reset (below) is opt-in and gated — it is the one operation that discards this state.
- **Dev-only DB auto-reset on schema drift**: `createVaultDatabase` / `createRegistryDatabase` stamp a schema fingerprint (hash of the migration journal **and** every migration's SQL body, so an in-place edit to an already-applied migration also counts as drift) into `PRAGMA user_version` on a freshly created DB. When the opt-in env flag `MASKOR_DB_AUTO_RESET` is set and a DB's stored fingerprint no longer matches the code's migration set, the DB file is dropped and recreated clean on open, then repopulated by the normal startup rebuild. An unreadable/corrupt DB file is itself treated as drift. Off by default; never fires in a packaged run. Eliminates the manual delete-db + restart + reload loop during greenfield schema iteration. Trade-off: a reset discards the DB-only state above, hence the dev gating. Note: a DB created before this feature shipped is unstamped (`user_version = 0`), so the first flag-on run resets it once even if the schema already matches — acceptable in greenfield, but it means the first auto-reset after upgrading is not a true drift signal.
- **Fault-tolerant rebuild**: rebuild reads each entity file independently and collects per-file parse failures rather than rejecting the whole scan on the first malformed file. Survivors are indexed; each failure becomes an `INVALID_ENTITY_FILE` state warning. The deliberate non-goal: a file that cannot be parsed is reported, **never auto-rewritten** — any "fix" would be guesswork that risks destroying user content. (Auto-fix is limited to the parseable-but-incomplete case handled by adoption.)
- **Manual DB reset (`index.reset`)**: an explicit, on-demand hard reset that drops `vault.db` and re-derives it from the vault, recovering from schema drift / corruption / a half-failed migration that `index.rebuild` cannot repair (rebuild re-derives row contents _through_ the live schema; reset recreates the file). Reuses the draft-restore teardown (stop watcher → close handle → drop caches → delete files → rebuild → restart watcher). Unlike the dev auto-reset it is **not** gated by `MASKOR_DB_AUTO_RESET` — it is a deliberate user action with a confirmation, and like rebuild it discards the DB-only state above. Vault DB only; the registry is out of scope.
- **Two databases**: Registry DB (`~/.config/maskor/registry.db`) is global; vault DB (`<vault>/.maskor/vault.db`) is per-vault and travels with the vault. No `project_uuid` column in vault DB.
- **Single transaction on rebuild**: Atomicity and batched disk flushes give consistent state and better performance than row-by-row commits.
- **Fragment "soft delete" via `fragments/discarded/`**: deleting a fragment via Maskor moves the file into `fragments/discarded/`; the DB row remains with `isDiscarded` derived from the path. Aspects, notes, and references are **hard-deleted** from the DB on unlink-buffer expiry — there is no `deletedAt` column for keyed entities. Identity across the unlink→re-add cycle is preserved through the UUID in frontmatter (see ADR-0002) rather than through a tombstoned row.
- **Revival is observability, not a recovery primitive**: when a previously-deleted UUID returns within the watcher's in-memory tracker TTL, the `*:synced` event carries `revived: true`. The flag is informational — identity is preserved either way through the frontmatter-UUID + UUID-keyed upsert. Soft-delete with a `deletedAt` column and a dedicated `revive()` method was considered (see ADR-0002 considered options) and deferred until a use case appears that the in-memory tracker can't satisfy.
- **Full-file hash guard**: Hash must cover frontmatter + body — hashing only the body would incorrectly skip the second watcher event after a UUID write-back.
- **No automatic file rewrites on drift**: Maskor surfaces `SyncWarning` for unresolved aspect keys; it does not auto-fix fragment files.
- **Aspect key as stable reference, not UUID**: Aspect names are unique within a vault, so `aspect_key` is sufficient as the join column in `fragment_properties`. A nullable `aspect_uuid` column adds resolution complexity without benefit — drift is captured equally well by checking whether the key exists in the aspects table.
- **`version` field removed**: Served no user-facing purpose and added frontmatter noise. Removed entirely.
- **`isDiscarded` derived from path**: After pool concept removal, discarded state is determined solely by whether `filePath.startsWith("discarded/")`. No frontmatter field; no DB column that needs external input.
- **Watcher started in `resolveProject` middleware**: Side effect in middleware is acknowledged; deferred to a more explicit startup mechanism when project lifecycle management is formalised.

---

## Removed concepts

- **Piece / `pieces/` staging folder**: The `pieces/` drop-zone and its per-file consume path were removed. A raw `.md` file dropped into `fragments/` is adopted directly by the watcher (UUID minted, full canonical frontmatter written back), so the staging folder was redundant. The shared `Piece` type, `vault.pieces.*`, `syncPieces`, the `PIECE_PREFIX` route, and the `pieces:consumed` event were all deleted. A `.md` left in a leftover `pieces/` folder now matches no watcher route and is silently ignored. References to pieces in older plans are historical. Do not re-introduce. (The importer's internal in-memory `Piece`/`RawPiece` split-result types are unrelated and retained — see `specifications/import-pipeline.md`.)
- **Pool** (`unprocessed`, `incomplete`, `unplaced`, `discarded`): The pool lifecycle concept was removed. Fragments no longer carry a `pool` field. References to pool in older plans (`vault-watcher.md`, `vault-content-index.md`, etc.) are historical. Do not re-introduce.
- **`aspect_uuid` in `fragment_properties`**: The `fragment_properties` table no longer has an `aspect_uuid` column. Fragment→aspect relationships are joined on `aspect_key`. References to `aspect_uuid` in older plans (`vault-content-index.md`, `vault-watcher.md`) are historical. Do not re-introduce.

---

## Open questions

- [x] 2026-04-22 — What value should `updatedAt` carry for files edited externally (where Maskor does not write back)? **Resolution** (2026-04-23): `fromFile` falls back to `new Date()` (sync time) when `updatedAt` is absent from frontmatter. For Obsidian-only edits, `updatedAt` in the DB reflects the time of sync rather than the user's edit time. Files without `updatedAt` in frontmatter never have it written back, so hash-guard prevents repeated upserts. Revisit if user-facing "last edited" timestamps become a product requirement.
- [ ] 2026-04-22 — Sequences/sections DB schema is deferred. When designed, storage-sync scope will expand to cover sequence sync rules.

---

## Acceptance criteria

- Full rebuild produces fragment/aspect/note/reference counts matching the vault file count
- Full rebuild recursively discovers nested aspects/notes/references; category is derived from the subfolder path
- An external file edit is reflected in the DB within ~250ms
- An API write is immediately reflected in the DB with no stale-index window
- A UUID is assigned and written back on first watcher detection of any entity that lacks one
- Rebuilding a vault whose entity files lack frontmatter UUIDs succeeds (no constraint failure); a UUID is minted and written back to each file (full canonical frontmatter for fragments, UUID-only for keyed entities), and all entities are indexed
- A second rebuild over an already-stamped vault writes no files (idempotent); entity files are byte-identical
- Moving an aspect/note/reference to a subfolder via the API updates `filePath` in the DB; no cascade rename occurs if the key is unchanged
- Out-and-back returns within the in-memory tracker TTL preserve entity identity and emit `revived: true` on the `*:synced` event
- Cross-entity-type returns (e.g. aspect file moved to `notes/`) create the destination entity with the UUID from frontmatter; the source row is deleted; no `revived` flag
- Aspect key drift produces a warning; it does not block or abort sync
- Watcher and rebuild cannot run concurrently — the mutex is enforced
- Deleting a fragment file moves it to `fragments/discarded/` and soft-deletes the DB row
- `isDiscarded` is `true` for any fragment whose `filePath` starts with `discarded/`
- SSE events are emitted after each watcher transaction, not inside it
