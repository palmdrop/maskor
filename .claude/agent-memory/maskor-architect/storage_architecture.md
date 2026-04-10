---
name: Storage package architecture
description: Layers, databases, factory pattern, and key contracts in @maskor/storage
type: project
---

**How to apply:** Any new package needing vault data goes through StorageService — not `createVault` directly.

## Layer stack

Parse → Serialize → Mappers → Vault (file I/O) → Indexer (DB queries) → Registry → StorageService

## Two SQLite databases (bun:sqlite + Drizzle)

- Registry DB: `~/.config/maskor/registry.db` — global, maps projectUUID → vaultPath
- Vault DB: `<vault>/.maskor/vault.db` — per-vault content index, always rebuildable

## Factory pattern

All public surfaces are factory functions, not classes: `createVault`, `createVaultIndexer`, `createProjectRegistry`, `createStorageService`.

## StorageService

- Entry point for all upstream packages
- Caches Vault, VaultDatabase, VaultIndexer per projectUUID (in-process Maps)
- `resolveProject(uuid)` → `ProjectContext` → pass to `getVault(context)` / `getVaultIndexer(context)`
- `MASKOR_CONFIG_DIR` env var overrides registry location (used in tests)

## VaultIndexer

- `rebuild()` = full O(n) scan, single SQLite transaction, soft-deletes absent entities
- Queries: `fragments.findByUUID`, `findByPool`, `findAll`, `findFilePath`; `aspects.findByKey`; notes/references by title/name
- `IndexedFragment` extends Fragment: adds `filePath`, `contentHash`; properties include `aspectUuid | null`
- Unresolved aspect keys → `SyncWarning { kind: "UNKNOWN_ASPECT_KEY" }` — never auto-fixed in files

## Known TODOs

- `vault.fragments.discard()` does full file scan — should use `indexer.findFilePath()`
- `rebuild()` loads all data into memory — needs chunked approach for large vaults
- No DB indexes on `(pool, deleted_at)` hot columns
- Registry manifest recovery not implemented (`recoverFromManifests`)
