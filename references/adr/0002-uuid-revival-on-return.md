# UUID revival on return from outside the vault

When a vault entity file disappears (`unlink`) and a file carrying the same UUID later reappears (`add`) within the same entity-type subtree, the watcher preserves the original entity's UUID instead of treating the UUID as a collision. Identity is anchored to the UUID written in frontmatter, not to the filesystem path. Users can drag aspects/notes/references out of the vault, edit them externally, and drag them back — at the same path, a new path in the same entity-type subtree, or a new path with a different filename — without losing identity or breaking fragment-frontmatter key references.

## Implementation notes

The implementation is intentionally pragmatic rather than soft-delete based:

- When an unlink's rename-buffer entry expires, the DB row is hard-deleted **and** the UUID is recorded in an in-memory `RecentlyDeletedTracker` (per watcher instance, per entity-type, ~24h TTL).
- When a subsequent `add` event fires for the same UUID, the tracker is consumed. If the UUID was recently deleted, the resulting `*:synced` event carries `revived: true`. Otherwise the upsert proceeds normally with no flag — identity is still preserved because the UUID came from frontmatter and the upsert is keyed on UUID.
- The tracker is process-lifetime only. After a Maskor restart, a returning file is treated as a first-discovery whose UUID happens to match a previously known one. Identity is still preserved (same UUID is written to DB), just without the `revived` flag.

## Cross-entity-type returns

A file moved across entity-type roots (e.g. `aspects/x.md` → `notes/x.md`) is **not** revival. The aspect row is hard-deleted when the unlink-buffer expires; the note row is created on the destination's add. The UUID is preserved across the type boundary (because it's anchored in frontmatter), but the `revived` flag is **not** set on the destination's `*:synced` event — each entity-type has its own recently-deleted tracker, and the aspect-side tracker is not consulted by the notes sync path.

Fragment frontmatter that referenced the original entity by key is left untouched (consistent with the "Maskor never rewrites fragment files" posture). For aspect→note flips this manifests as `UNKNOWN_ASPECT_KEY` warnings on the next rebuild — the user manually re-attaches or removes the orphan key.

A genuine UUID collision — two live files claiming the same UUID at different paths under the same entity-type subtree — keeps the existing behavior for keyed entities: the upsert is keyed on UUID, so the most recently processed file wins the DB row. Fragments use a separate `findFragmentUuidCollision` path that mints a new UUID and warns; keyed-entity collisions are rare enough in practice that the dedicated handler is deferred.
