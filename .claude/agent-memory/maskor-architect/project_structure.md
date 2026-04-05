---
name: Maskor project structure and package status
description: Package locations, roles, and build status across the monorepo
type: project
---

Monorepo at `/Users/antonhildingsson/Personal/maskor`. Bun workspaces in root `package.json`.

**Why:** Learning project — expansive by design. Packages reference each other via `workspace:*`.

**How to apply:** Always use absolute paths. Check package status before suggesting work in a package.

## Package status

| Package     | Path                     | Status     | Notes                                      |
| ----------- | ------------------------ | ---------- | ------------------------------------------ |
| `shared`    | `packages/shared/src/`   | Built      | Types, branded UUIDs, slugify, pino logger |
| `storage`   | `packages/storage/src/`  | Built      | Vault I/O, indexer, registry, service      |
| `api`       | `packages/api/src/`      | Scaffolded | `index.ts` stub + tests only               |
| `processor` | `packages/processor/`    | Scaffolded | Stub only                                  |
| `sequencer` | `packages/sequencer/`    | Scaffolded | Stub only                                  |
| `importer`  | `packages/importer/`     | Scaffolded | Stub only                                  |
| `frontend`  | `packages/frontend/src/` | Scaffolded | Vite + React, no API calls yet             |

## Key files

- Root config: `/Users/antonhildingsson/Personal/maskor/package.json`
- Shared types: `packages/shared/src/types/domain/`
- Vault I/O: `packages/storage/src/vault/markdown/vault.ts`
- Parse: `packages/storage/src/vault/markdown/parse.ts`
- Indexer: `packages/storage/src/indexer/indexer.ts`
- Registry: `packages/storage/src/registry/registry.ts`
- StorageService: `packages/storage/src/service/storage-service.ts`
- Vault DB schema: `packages/storage/src/db/vault/schema.ts`
- Registry DB schema: `packages/storage/src/db/registry/schema.ts`
- Architecture doc: `references/ARCHITECTURE.md`
- Sync contract: `references/SYNC_CONTRACT.md`
