# Project Config — Vault as Source of Truth

**Date**: 29-04-2026
**Status**: Done
**Spec**: `specifications/project-config.md`
**Closed**: 29-04-2026

---

## Goal

> All project data — name, editor config, and any future fields — lives in `<vault>/.maskor/project.json`. The registry DB stores only UUID → vaultPath. A vault can be moved to a new machine and re-registered without losing any data.

---

## Tasks

### Phase 1: Revert DB changes

- [x] Remove `vimMode` and `rawMarkdownMode` columns from `packages/storage/src/db/registry/schema.ts`
- [x] Remove `name` from the registry DB schema — it must be read from `project.json` going forward
- [x] Delete migration file `packages/storage/src/db/registry/migrations/20260429_add_project_editor_config.sql` and its entry in `migrations/meta/_journal.json`
- [x] Remove `vimMode`, `rawMarkdownMode`, and `name` from `ProjectRecord` in `packages/storage/src/registry/types.ts`
- [x] Strip the corresponding fields from `updateProject` in `packages/storage/src/registry/registry.ts` (patch type and update logic)
- [x] Strip the fields from `updateProject` in `packages/storage/src/service/storage-service.ts`
- [x] Remove `name`, `vimMode`, and `rawMarkdownMode` from `ProjectSchema` and `ProjectUpdateSchema` in `packages/shared/src/schemas/domain/project.ts`

### Phase 2: Vault manifest schema

- [x] Define a `ProjectManifest` type in the storage layer (internal to storage, not shared):
  ```
  { projectUUID, name, registeredAt, config: { editor: { vimMode, rawMarkdownMode  } } }
  ```
- [x] Make `config` optional on read — manifests written before this change lack it; default all config fields to `false` when absent
- [x] Make `name` optional on read — older manifests may lack it; fall back to an empty string or derive from path
- [x] Update `writeVaultManifest` in `packages/storage/src/registry/registry.ts` to do a **read-modify-write**: read the existing manifest, merge only the fields being updated, then write. Prevents any field from clobbering another.
- [x] On `registerProject`, write a full manifest (UUID, name, registeredAt, default config) to `<vault>/.maskor/project.json`

### Phase 3: Storage read/write paths

- [x] **`getProject`**: look up vaultPath from the registry row, read `project.json`, and return all fields from the manifest (UUID, name, config)
- [x] **`listProjects`**: for each registry row, read the vault's `project.json` and populate the record from it. (Acceptable cost — personal tool, few projects.)
- [x] **`updateProject`** — any field patch writes only to `project.json` via read-modify-write; no DB columns beyond UUID + vaultPath are ever touched
- [x] Add `name`, `vimMode`, and `rawMarkdownMode` back to `ProjectRecord` (in the nested `editor` property) in `types.ts` — sourced from vault, not DB
- [x] Add them back to `ProjectSchema` and `ProjectUpdateSchema` in shared

### Phase 4: API and frontend

- [x] No API route changes needed — `PATCH /projects/:id` already accepts the patch body; the storage layer handles routing of fields
- [x] Regenerate the orval client so shared-type changes propagate to the frontend generated code
- [x] Verify the ProjectConfigPage UI still works end-to-end with no frontend changes beyond the regenerated client

### Phase 5: Tests

- [x] `registerProject` — assert `project.json` is written with correct UUID, name, registeredAt, and default config
- [x] `updateProject` with a name patch — assert config is preserved in `project.json`, no DB column written
- [x] `updateProject` with a config patch — assert name is preserved, no DB column written
- [x] `getProject` / `listProjects` — assert all fields are returned from the vault manifest, not DB columns
- [x] Assert that re-registering a vault that already has a `project.json` (simulating a move to a new machine) preserves its existing data

---

## Notes

The registry is intentionally minimal after this change: UUID + vaultPath only. Any richer project metadata added in the future belongs in `project.json`, not the DB.

DO NOT IMPLEMENT until clearly stated by the developer.
