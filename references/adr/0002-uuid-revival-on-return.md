# UUID revival on return from outside the vault

When a vault entity file disappears (`unlink`) and a file carrying the same UUID later reappears (`add`) within the same entity-type subtree, the watcher preserves the original entity's UUID instead of treating the UUID as a collision. Identity is anchored to the UUID written in frontmatter, not to the filesystem path. Users can drag aspects/notes/references out of the vault, edit them externally, and drag them back — at the same path, a new path in the same entity-type subtree, or a new path with a different filename — without losing identity or breaking fragment-frontmatter key references.

## Implementation

- When an `unlink` event's rename-buffer entry expires, the DB row is **hard-deleted** and the UUID is recorded in an in-memory `RecentlyDeletedTracker` (per watcher instance, per entity-type, ~24h TTL).
- When a subsequent `add` fires for the same UUID, the tracker is consumed. If the UUID was recently deleted, the resulting `*:synced` event carries `revived: true`. Otherwise the upsert proceeds normally — identity is still preserved because the UUID came from frontmatter and the upsert is keyed on UUID.
- The tracker is process-lifetime only. After a Maskor restart, a returning file is treated as a first-discovery whose UUID happens to match a previously known one. Identity is still preserved (same UUID is written to DB); only the `revived` flag is lost.

## Cross-entity-type returns

A file moved across entity-type roots (e.g. `aspects/x.md` → `notes/x.md`) is **not** revival. The aspect row is hard-deleted when the unlink-buffer expires; the note row is created on the destination's add. The UUID is preserved across the type boundary (because it's anchored in frontmatter), but the `revived` flag is **not** set on the destination's `*:synced` event — each entity-type has its own recently-deleted tracker, and the aspect-side tracker is not consulted by the notes sync path.

Fragment frontmatter that referenced the original entity by key is left untouched (consistent with the "Maskor never rewrites fragment files" posture). For aspect→note flips this manifests as `UNKNOWN_ASPECT_KEY` warnings on the next rebuild — the user manually re-attaches or removes the orphan key.

## Considered options

**(A) Hard-delete + in-memory tracker** — chosen. No schema change. Identity is preserved organically by the frontmatter-UUID + UUID-keyed upsert that the system already does; the tracker exists only to attach the `revived: true` flag. The flag is observability, not correctness — losing it across a Maskor restart is acceptable.

**(B) Soft-delete with `deletedAt` columns** — rejected for this iteration. Was the original design sketched in the plan (`references/plans/entity-subfolders.md`) and an earlier draft of this ADR. Would have meant: adding `deletedAt` to `aspects` / `notes` / `references` tables, filtering every read by `deletedAt IS NULL`, switching the rename-buffer-expiry path from hard-delete to soft-delete, and adding a dedicated `storageService.<type>.revive()` method. The cost — touching every read query and a non-trivial migration — wasn't justified given that identity preservation already worked without it. Worth revisiting if either of these becomes true: (1) returning files across Maskor restarts need to carry the `revived` flag, or (2) a "Restore from soft-delete" UX surface is added.

**(C) UUID-collision detection for keyed entities** — also deferred. Fragments have `findFragmentUuidCollision`, which mints a new UUID and warns when two live files claim the same UUID at different paths. Aspects/notes/references currently let the most recently processed write win the DB row (silent overwrite). Rare in practice; deferring until the failure mode is actually observed.

## Consequences

- Cross-entity-type "moves" preserve the UUID but not the logical entity. A future renamer pointing fragment frontmatter at the new entity type would have to be a deliberate user action, not an automatic cascade.
- Without a `deletedAt` column, there is no audit trail for entities that have been soft-removed. If the user wants to "restore a deleted aspect," the answer is filesystem-level: find the file (vault history, OS trash, version control) and drop it back in.
- A returning file after a Maskor restart will be indistinguishable from a first-discovery file that happens to carry a UUID. Both insert a row with the UUID-from-frontmatter; the action log just sees a `*:synced` event with no flag.
