# Review: Project Config Phases 4–5 + Vault-as-Source-of-Truth

**Date**: 2026-04-29
**Scope**: `packages/storage/src/registry/`, `packages/storage/src/service/storage-service.ts`, `packages/storage/src/__tests__/registry.test.ts`, `packages/api/src/routes/aspects.ts`, `packages/api/src/schemas/arc.ts`, `packages/frontend/src/pages/ProjectConfigPage.tsx`, `packages/shared/src/schemas/domain/project.ts`
**Plan**: `references/plans/project-config-page.md`, `references/plans/project-config-vault-storage.md`
**Spec**: `specifications/project-config.md`

---

## Overall

Two bugs need fixing before this ships: creating a new arc (no existing arc) always returns 400 because the frontend sends `aspectKey: ""` against a schema that requires `min(1)`, and re-registering a vault after a DB loss silently resets editor config to defaults — defeating the vault portability intent. The registry and storage layers are otherwise clean: DB correctly stripped to UUID + vaultPath only, read-modify-write manifest logic is correct, and all the vault-as-source-of-truth tests pass. The Aspects tab and Arc editor component are complete and readable. Both bugs from the prior review (double-save race, broad `.catch`) have been fixed.

---

## Bugs

### 1. New arc creation always fails with 400

`packages/frontend/src/pages/ProjectConfigPage.tsx:552` — `handleSave` derives `aspectKey` as `existingArc?.aspectKey ?? ""`. When no arc exists yet (the "Define arc" flow), this is `""`. The body is sent to `PUT /arc`, where `ArcCreateSchema` validates `aspectKey: z.string().min(1)`. The schema rejects it with a 400 before the handler runs. The user can never successfully create a first arc for any aspect.

```
"Define arc" clicked → draft = DEFAULT_POINTS
"Save arc" clicked → aspectKey = "" → 400 Validation Error
```

The `aspectKey` in the request body is ignored by the API handler anyway — it derives the key from the aspect index via the route param. The field is superfluous in `ArcCreateSchema`.

Fix: Remove `aspectKey` from `ArcCreateSchema` and `ArcCreate` in shared. The API already resolves it from the route.

---

### 2. Re-registration resets editor config to defaults

`packages/storage/src/registry/registry.ts:90–95` — `registerProject` calls `writeVaultManifest` with explicit default config:

```ts
await writeVaultManifest(vaultPath, {
  projectUUID,
  name,
  registeredAt: now.toISOString(),
  config: { editor: { vimMode: false, rawMarkdownMode: false } },
});
```

`writeVaultManifest` uses a deep merge, but because `vimMode: false` is explicitly in the patch it overwrites any existing `vimMode: true` in the manifest. A vault moved to a new machine and re-registered loses its editor config.

The plan required: "Assert that re-registering a vault that already has a `project.json` preserves its existing data." The portability test only checks name preservation — it does not assert editor config is unchanged after re-registration, so this slipped through.

Fix: Only include default config when no existing manifest is found:

```ts
const existing = await readVaultManifest(vaultPath);
await writeVaultManifest(vaultPath, {
  projectUUID,
  name,
  registeredAt: now.toISOString(),
  ...(existing ? {} : { config: { editor: { vimMode: false, rawMarkdownMode: false } } }),
});
```

Also update the portability test to assert `manifest.config.editor.vimMode === true` after re-registration.

---

## Design

### 3. `updatedAt` never changes after initial registration

`packages/storage/src/registry/registry.ts:143–163` — `updateProject` does a SELECT + `writeVaultManifest` only; it never issues a DB UPDATE. The returned `ProjectRecord.updatedAt` is always the registration timestamp regardless of how many times name or editor config is changed. The `PATCH /projects/:id` response always shows the original creation time as `updatedAt`.

Fix: either run `database.update(projectsTable).set({ updatedAt: new Date() })` inside `updateProject`, or read `updatedAt` from the manifest (would require adding it there). Given the DB-is-minimal design, updating `updatedAt` in the DB row on `updateProject` is the minimal change.

---

## Minor

### 4. Portability test missing assertion

`packages/storage/src/__tests__/registry.test.ts:182` — The re-registration test sets `vimMode: true`, removes the project, re-registers, then only checks `manifest.name`. It should also assert `manifest.config.editor.vimMode === true` (expected to fail until bug #2 is fixed, confirming the gap).

### 5. `ArcEditor` stays expanded after arc is removed

`packages/frontend/src/pages/ProjectConfigPage.tsx:566–574` — After `handleRemove` succeeds, `expanded` is not reset. The panel stays open showing the empty "Define arc" state rather than collapsing. Minor cosmetic issue — no data loss risk.

### 6. `useGetArc` retries on 404, causing unnecessary requests and prolonged loading

`packages/frontend/src/pages/ProjectConfigPage.tsx:2516` — `ArcEditor` calls `useGetArc` immediately on mount for every aspect in the list. Aspects with no arc return 404, which React Query treats as a retryable error (3 retries with backoff by default). With N aspects and no arcs defined, the aspects tab generates 3N extra requests on load and shows a loading state longer than necessary.

404 from `GET /arc` means "no arc defined" — an expected steady state, not a transient failure. Retrying will never succeed.

Fix: pass `retry: false` (or `retry: (_, error) => error?.status !== 404`) in the query options for `useGetArc` at the call site in `ArcEditor`.

---

## Non-issues

- **`aspectKey` in `ArcCreate` body is ignored by the server** — the handler always derives key from the aspect index via route param; sending any value has no effect. Bug #1 is purely a schema-level rejection.
- **Note/reference link fix** (`fragment-metadata-form.tsx`) — the prior diff had a bug comment about using `referenceField.id` (form key) as the route param. The current file correctly uses `referenceNameToUuid.get(referenceField.value)` and `noteTitleToUuid.get(noteField.value)` maps. Fixed.
- **Both bugs from the prior review fixed** — double-save guard (`if (updateProject.isPending) return`) and narrowed `ENOENT` catch in notes/references update are both in place.
- **`vimMode={false}` hardcoded in editor pages** — correctly tagged with TODO; wired properly in `fragment-editor.tsx` via `useProjectEditorConfig`.
- **`listProjects` reads one manifest per project** — acceptable at personal-tool scale; plan acknowledges this.
- **`cursor: pointer` added globally to `button, a`** — correct fix; browser default is `auto` for buttons.
