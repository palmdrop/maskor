# Dump for storage-sync spec

**Date**: 22-04-2026
**Status**: Draft

## Settled decisions

**Ownership boundary**

- Vault (markdown) owns: `uuid`, `title`, `version`, `readyStatus`, `notes[]`, `references[]`, inline aspect weights (Dataview syntax), body content
- DB owns: `contentHash`, `syncedAt`, sequence positions, fitting scores, arc positions, `filePath` index
- DB is always fully rebuildable from vault — never authoritative on anything vault owns

**UUID assignment**

- Written into frontmatter on first detection if missing; never changed after
- Entities tracked by UUID, not filename
- UUID collision (manually duplicated file): assign new UUID, write back, log warning

**Rebuild**

- Full O(n) scan, single SQLite transaction per run
- Order: aspects → notes → references → fragments (aspect key map must exist before fragment properties resolve)
- Soft-deletes entities absent from vault (`deletedAt`); never hard-deletes fragments (moves to `discarded`)
- `ignoreInitial: true` on watcher — startup rebuild is mandatory before events are meaningful
- Holds all vault data in memory before committing (documented structural debt)

**Watcher (VaultWatcher)**

- Chokidar-based incremental sync
- `awaitWriteFinish` (`stabilityThreshold: 200`, `pollInterval: 50`) is sole guard against partial writes — no extra debounce
- Full-file hash guard (frontmatter + body) makes all watcher events idempotent for API-originated writes
- Entity routing by relative path prefix; non-`.md` files and `.maskor/`, `.obsidian/` ignored
- `start()` idempotent; `stop()` safe before `start()`
- Must be paused or mutex-gated during `rebuild()` — mid-rebuild watcher upserts are overwritten by the in-memory snapshot on transaction commit
- Per-project cache; `removeProject()` must stop and evict the watcher

**API write path**

- After every `StorageService` vault write, call matching upsert helper inline
- Closes the stale-index window for API-originated writes
- Watcher fires afterward and hash-guards to no-op

**Aspect key resolution**

- Inline fields stored by raw string key; UUID resolved at rebuild/sync time
- Unresolved keys → `SyncWarning { kind: "UNKNOWN_ASPECT_KEY" }`
- `fragment_properties.aspect_uuid` is `NULL` in DB when key doesn't resolve — this is the drift signal
- Maskor never auto-rewrites fragment files to fix drift; user must resolve manually

**Sync rules (external edits)**

- File created outside Maskor: DB record created, UUID assigned + written back if missing
- File edited outside: contentHash comparison detects change, re-syncs frontmatter and inline fields
- File renamed: UUID-tracked, only DB `filePath` updated; other entities' frontmatter title refs are not rewritten
- File deleted: fragment moved to `discarded/` folder; notes/references soft-deleted in DB
- Conflict (concurrent Maskor + user edit): last-write-wins; stale `version` is a warning, not an error

**SSE change events**

- `VaultSyncEvent` type lives in `@maskor/shared` (so frontend can import without depending on `@maskor/storage`)
- Watcher emits events after transaction returns, not inside the callback
- `GET /projects/:projectId/events` — plain Hono route, intentionally outside OpenAPI spec
- Frontend `useVaultEvents` hook invalidates React Query via broad `queryKey: [projectId]` prefix

**Two databases**

- Registry DB: `~/.config/maskor/registry.db` — global, `projectUUID → vaultPath`
- Vault DB: `<vault>/.maskor/vault.db` — per-vault, content index, no `project_uuid` column

---

## Open questions

1. **Name uniqueness enforcement** — titles and names must be unique within the vault, but external edits can introduce duplicates. Conflict resolution undefined: first-seen wins? last-modified wins? manual resolution required? _(SYNC_CONTRACT.md)_

- ANSWER: Maskor should detect the conflict and prompt the user to manually resolve the issue. For now, the user will have to manually rename conflicting files. In the future, Maskor should help them compare files and resolve conflicts.

2. **Stale title refs on rename** — when a note/reference is renamed, fragment frontmatter may still hold the old title. Options: proactive rewrite of other fragment files, or lazy resolution on next sync. _(SYNC_CONTRACT.md)_

- ANSWER: File name and title are not necessarily the same. A file rename does not have to update title. However, file names still should be unique.

3. **`version` field visibility** — is a user-visible `version` in frontmatter useful, or should it move to DB-only? _(SYNC_CONTRACT.md)_

- ANSWER: Version field serves no real purpose and should be removed.

4. **`readyStatus` / `weight` write-back trigger** — when does Maskor write back an auto-generated value? On save, on explicit user action, or on sequencer run? _(SYNC_CONTRACT.md)_

- ANSWER: On save.

5. **Watcher start location** — `resolveProject` middleware (recommended; side effect in middleware is a noted downside) vs. explicit call at project create/load (two call sites). _(sse-vault-events plan)_

- ANSWER: Lets keep it in `resolveProject` for now but make a note in `suggestions.md`.

6. **Rebuild-on-load** — frontend currently triggers rebuild on every project load. Recommended to move server-side (alongside watcher start), but still a stopgap. _(sse-vault-events plan)_

- ANSWER: I agree with your recommendation.

7. **`pieces/` single-file routing** — `consumeAll()` is not a valid per-file handler. Need either a `vault.pieces.consume(filePath)` method or route all `pieces/` add events to `consumeAll()` and document the trade-off. _(vault-watcher plan)_

- ANSWER: A per-file handler is better. The pieces does not have to be consumed all at once. A step by step consumption is better to preserve memory. In the future, Redis or other queuing system can be introduced as a middle-layer, if needed.

8. **Sequences/Sections schema** — all sequence data is DB-only but no tables exist in `vault/schema.ts` yet. _(ARCHITECTURE.md)_

- ANSWER: This is deferred for now.

9. **Rebuild mutex** — pausing the watcher or using a mutex during `rebuild()` is specified but not yet implemented as a plan. _(vault-watcher plan)_

- ANSWER: This should be implemented now.

---

## Constraints

- All vault paths must be relative to vault root; `resolvePath` guard enforces this with `PATH_OUT_OF_BOUNDS` on traversal
- `bun:sqlite` is synchronous — all upsert helpers must stay sync; no `async` in helpers
- Fragment files are never auto-modified by Maskor for drift recovery
- `gray-matter` for frontmatter parse/serialize (Obsidian-compatible)
- Inline aspect fields use Dataview-compatible syntax (`key:: value`)
- Chokidar v3+ ships its own types — do not install `@types/chokidar`
- Factory functions throughout (`createVaultWatcher`, `createVaultIndexer`, etc.) — no classes
- SQLite only (local-first; `bun:sqlite` is native)
- DB-only data (sequences, fitting scores, arc positions) is lost on DB corruption and must be recalculated — this is acceptable by design

---

## Inconsistencies and surprises

1. **`filePath` storage: absolute vs. relative** — The vault-content-index plan's SQL comment says `file_path TEXT NOT NULL UNIQUE, -- absolute path`. The vault-watcher plan explicitly says "The DB stores paths relative to vault root." ARCHITECTURE.md field ownership table and the watcher section confirm relative paths. The SQL comment is wrong and should be corrected in the spec.

- RESOLUTION: Update the comment to reflect the reality: relative paths.

2. **`updatedAt` missing from schema** — SYNC_CONTRACT.md and ARCHITECTURE.md both list `updatedAt` as DB-only. The actual DB schema (vault-content-index plan) only defines `synced_at`. There is no `updated_at` column. Either `updatedAt` was folded into `syncedAt` and the docs weren't updated, or it was accidentally omitted.

- RESOLUTION: `updatedAt` should not be DB-only. It could be useful for users to see. Update docs.

3. **`rebuild()` async surface over sync internals** — The vault-content-index plan declares `rebuild(): Promise<RebuildStats>` while explicitly stating upsert helpers must stay synchronous. This is internally consistent (async wrapper is fine) but worth making explicit in the spec so future contributors don't re-litigate whether the interface should be sync.

- RESOLUTION: Agree.

4. **Watcher rebuild race was previously marked "safe"** — The vault-watcher plan notes its own edge-case table previously marked this as safe and corrects that: it is not safe. The mitigation is specified but there is no follow-up plan implementing it. This is an unresolved structural debt item.

- RESOLUTION: Add a strongly worded suggestion item.

5. **`contentHash: ""` on fragment create** — `POST /fragments` sets `contentHash: ""`. ARCHITECTURE.md flags this as a known issue ("downstream consumers must not rely on it until fixed") but there is no plan to fix it. The spec should either mark this as an accepted gap or open a concrete question.

- RESOLUTION: Add a suggestion to the `suggestions.md` file.

## My notes

Storage sync keeps the internal database in sync with the actual state of files. The storage sync also is responsible for updating and reading file content. The storage sync deals with files and database syncs.

OUT OF SCOPE: The storage sync SHOULD NOT worry about

- sequencing
- interleaving

For now, we only worry about aspects, fragments, notes and references.
