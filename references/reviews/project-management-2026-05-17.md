# Review: Project Management

**Date**: 2026-05-17
**Scope**: `packages/frontend/src/pages/ProjectManagementPage/`, `packages/frontend/src/components/FolderPicker.tsx`, `packages/frontend/src/api/{fs,settings}.ts`, `packages/api/src/routes/{projects,fs,settings}.ts`, `packages/api/src/helpers/trash.ts`, `packages/storage/src/registry/registry.ts`, `packages/storage/src/settings/`
**Spec**: `specifications/project-management.md`
**Plan**: `scripts/ralph/archive/2026-05-17-project-management/`

---

## Overall

The lifecycle features land: adopt/create/maskor-managed registration, rename, locate-vault, deregister with optional trash, and a settings file with one key. Manifest re-adoption now reuses the UUID, closing the long-standing gap. The most important finding is structural rather than functional: the new mutation routes (`POST /projects`, `PATCH /projects/:id`, `PATCH /projects/:id/vault-path`, `DELETE /projects/:id`, `PATCH /settings`) all call `storageService.*` and `settingsService.*` directly from route handlers, which violates `packages/api/.claude/CLAUDE.md`'s rule that every state-changing operation must go through `src/commands/`. There are also two production-shipping `console.log` statements in `registry.ts`, a partial-failure path on `mode: "create"` that can leave folders without a registry row, and four dialogs that bypass the generated orval client because codegen hasn't been re-run against the new routes. The three-card registration UI does what the spec describes, but the spec and the user's current intent are diverging — worth a separate spec update rather than fixing in code.

---

## Bugs

### 1. Partial-failure on `mode: "create"` leaves orphan files on disk

`packages/storage/src/registry/registry.ts:147-201` — On create, the sequence is:

```
mkdir(vaultPath) → mkdir(aspects/) → writeVaultManifest(.maskor/project.json) → database.insert(projects)
```

If the insert throws (most realistically `UNIQUE constraint failed: projects.vault_path` when the path is already registered, but any DB-level failure qualifies), the four prior steps have already written to disk. The user sees an error, but the folder, `aspects/`, and `.maskor/project.json` are all on disk with a fresh UUID, unowned by the registry. Re-trying with `mode: "create"` then hits the "existing manifest" branch (line 154-157) and silently adopts the orphan with the *previous* UUID — masking the original failure.

```
mkdir vault    →  OK
mkdir aspects/ →  OK
writeManifest  →  OK (new UUID U1 on disk)
db.insert      →  FAIL (UNIQUE)
                  user sees error, files remain
retry create   →  reads orphan manifest, reuses U1, inserts row
                  → registry now points at originally-failing path with originally-rejected UUID
```

Fix: pre-check `vaultPath` uniqueness in `registerProject` before any filesystem write, or insert the registry row first and roll back the row if subsequent FS writes fail. The first option matches the existing manifest-first ordering for `mode: "adopt"` (line 125-146) and is the smaller change.

### 2. Debug `console.log` statements shipped in registry

`packages/storage/src/registry/registry.ts:41, 180, 193` — Three `console.log` calls added in this branch:

- Line 41: `console.log("WRITING VAULT MANIFEST");` inside `writeVaultManifest`
- Line 180: `console.log("insert project", projectUUID, vaultPath);` inside `registerProject`
- Line 193: `console.log("error", error);` inside the insert's catch block

These bypass the project's `Logger` abstraction and will pollute stdout in every test run and every production session. The catch-block log additionally hides the wrapped `ProjectConflictError` because the raw error is logged before the typed error is thrown — a future debugger will see the noisy `console.log` and ignore the typed handling.

Fix: remove all three.

### 3. Four dialogs bypass the generated orval client

`packages/frontend/src/pages/ProjectManagementPage/components/{AdoptProjectDialog,CreateProjectDialog,MaskorManagedDialog,LocateVaultDialog}.tsx` — Each dialog defines a hand-rolled `useMutation` that calls `customFetch("/projects", { method: "POST", ... })` (Adopt/Create/Managed) or `customFetch("/projects/:id/vault-path", { method: "PATCH", ... })` (Locate). The `AdoptProjectDialog:62` even carries a `// TODO: why a custom mutation here and not the generated orval hook?` comment.

Root cause: `packages/frontend/src/api/generated/projects/projects.ts` only contains `useListProjects`, `useGetProject`, `useCreateProject`, `useUpdateProject`, `useDeleteProject` — `updateProjectVaultPath` is missing entirely, and `useCreateProject`'s body type `ProjectCreate` predates the `mode` field. Orval codegen reads from a running API (`orval.config.ts:9`), so the generated client was last run before this branch's route additions. `packages/frontend/src/api/{fs,settings}.ts` also hand-roll their hooks for the same reason — the `/fs/*` and `/settings` routes have `createRoute` definitions but aren't present under `src/api/generated/`.

Consequences: type safety on the request bodies is lost (the custom mutations type the body inline, so the `mode` field is hard-coded as a literal in each dialog and never validated against the source schema), the four mutation key namespaces aren't standardized, and the manual `queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })` calls have to be repeated.

Fix: start the API, re-run codegen, then replace the four custom mutations and the `useSettings`/`usePatchSettings`/`useFsHome`/`useFsList` hooks with the generated versions.

### 4. Maskor-managed slug collision resolution is client-side only

`packages/frontend/src/pages/ProjectManagementPage/components/MaskorManagedDialog.tsx:50-58` — The slug is derived in the browser, then `resolveSlug` checks against a snapshot of `useFsList(managedRoot).data` to pick a free suffix. The resolved path is then sent verbatim to `POST /projects` with `mode: "create"`. The backend `registerProject` for `mode: "create"` does `mkdir -p` (which is idempotent on an existing directory) and inserts the registry row — there is no backend-side slug+suffix loop.

Failure mode: two windows open simultaneously, both type the same name, both see `~/Documents/Maskor/my-novel` as free, both submit. First request wins; second request's `mkdir -p` succeeds against the now-existing directory, `writeVaultManifest` re-uses the existing UUID via the `existingManifest` branch (bug #5 below), and `database.insert` rejects with a `UNIQUE constraint failed: projects.vault_path` 409. The spec at line 91 says collisions should resolve "silently" with `-2`, `-3` — that contract is broken by any concurrent submission or by a stale `useFsList` cache.

Fix: move slug derivation + suffix loop into `registerProject` (or a dedicated `commands/create-managed-project.ts`) so the resolution is atomic with the registry insert. The frontend can still preview the *expected* path but should not be the source of truth.

---

## Design

### 5. Route handlers bypass the `commands/` layer

`packages/api/src/routes/projects.ts:200-269`, `packages/api/src/routes/settings.ts:42-55` — `packages/api/.claude/CLAUDE.md` states: "Every state-changing API operation must go through `src/commands/`. Direct storage calls in route handlers are not allowed for mutations." The five new mutation handlers (`createProject`, `updateProject`, `updateVaultPath`, `deleteProject`, `patchSettings`) call `storageService.registerProject`, `storageService.updateProject`, `storageService.updateProjectVaultPath`, `storageService.removeProject`, and `settingsService.writeSettings` directly. No `commands/projects/`, `commands/settings/`, or trash command exists.

The rest of the codebase (fragments, aspects, notes, references, sequences) all route through `src/commands/`. This branch is the first regression. Consequences: command-layer behaviors (action-log emission, transactional context, retry semantics if/when they're added) won't apply to project lifecycle. The trash-on-delete logic in `projects.ts:258-263` is especially exposed — it sits between two state mutations (vault file removal and registry row removal) with no transactional wrapper.

Fix: lift the five mutations into `commands/projects/{register,update,update-vault-path,remove}.ts` and `commands/settings/patch.ts`. Pull the trash call into the remove command so the FS+registry write live behind one boundary.

### 6. Three-flow registration UI fights itself

`packages/frontend/src/pages/ProjectManagementPage/index.tsx:51-83` plus the three registration dialogs — Adopt, Create-at-path, and Maskor-managed are three top-level affordances surfacing what is fundamentally one decision: "name the project, optionally tell Maskor where it lives." The three flows then collapse to two backend modes (`adopt`/`create`) and share most of their UI scaffolding (picker, confirm step, folder-kind detection, name override).

The spec at `specifications/project-management.md:23-27` and the "Prior decisions" entry at line 162 explicitly defend the three-affordance design on discoverability grounds. The user has now said the unified flow is the intended direction. This is a spec/intent divergence, not a bug — fixing it in code without a spec update will just re-assert the three-card pattern next time someone reads the spec.

Fix: update `specifications/project-management.md` first (the three-flow scope, the "Prior decisions" entry, the acceptance criteria for US-009/US-010/US-011), then redesign the UI to a single name+optional-path form. Discoverability is preserved with placeholder text on the path input ("Leave empty to use ~/Documents/Maskor/<slug>").

### 7. `mode: "create"` silently adopts an existing manifest

`packages/storage/src/registry/registry.ts:154-176` — When a user submits `mode: "create"` against a path that already has `.maskor/project.json`, the registry reuses the existing UUID and skips writing the manifest. No warning surfaces to the caller. This is the same "adopt" behavior triggered through the wrong UI path — bypassing all the adopt-time UX (folder-kind detection, non-markdown file count warning, name pre-fill from manifest).

The branching probably exists to make `registerProject` idempotent on retry, but it conflates two distinct user intents:

- "create, but the dir happens to exist already" (probably OK if empty / no manifest)
- "create, and there's a manifest there" (the user almost certainly meant adopt)

Fix: in `mode: "create"`, reject with a typed error when an existing manifest is found, and let the caller (eventually a command) decide whether to surface "did you mean adopt?" or to proceed.

### 8. `FolderPicker` has no "new folder" affordance

`packages/frontend/src/components/FolderPicker.tsx:62-145` — The picker navigates but cannot create. The Create dialog works around this with `allowNonExistent={true}` (line 16) and lets the user type a new segment into the address bar — but discoverability is poor (`MaskorManagedDialog`'s "Will be created at" preview shows the trick is reachable but only one level deep, and only by typing).

Fix: add a `+ New folder` button next to the address bar that opens a small inline input, joins the typed name to the current path, and navigates into it without hitting the backend. Existing `allowNonExistent` flow then handles the actual creation on submit. Out of scope for this branch if the unified flow (item #6) absorbs the use case differently.

### 9. Duplicated folder-kind detection across Adopt and Create dialogs

`packages/frontend/src/pages/ProjectManagementPage/components/AdoptProjectDialog.tsx:20-47` and `CreateProjectDialog.tsx:21-48` — `FolderKind`, `FOLDER_KIND_LABELS`, `isMarkdown`, `detectFolderKind`, and `countNonMarkdownFiles` are copy-pasted between the two files. `.claude/CLAUDE.md` calls out: "If you notice overlap, break out into a new function." This will only get worse if the unified-flow refactor (#6) lands.

Fix: extract to `packages/frontend/src/pages/ProjectManagementPage/utils/folder-kind.ts` (or similar) and import.

---

## Minor

### 10. Unix path separator hardcoded in maskor-managed path join

`packages/frontend/src/pages/ProjectManagementPage/components/MaskorManagedDialog.tsx:58, 115` — `${managedRoot}/${resolvedSlug}` and the same in the "Will be created at" preview. The spec at `specifications/project-management.md:140` lists `%USERPROFILE%\Documents\Maskor\` as the Windows default, so on Windows the displayed/submitted path becomes `C:\Users\...\Maskor/my-novel`. Node's `path.isAbsolute` and `mkdir -p` both normalize this, so the code works — but the UI copy will look broken and any future string-equality comparisons on paths will fail.

Fix: a tiny `joinPath` util that picks separator from the existing string, or a backend `/fs/join` endpoint, or just keep this in mind when the slug logic moves backend per #4.

### 11. Settings response folds `warning` into the data shape

`packages/api/src/routes/settings.ts:47, 54` — The handler returns `{ ...settings, ...(warning !== undefined ? { warning } : {}) }`, so the warning rides in the same JSON object as `maskorManagedRoot`. The frontend (`SettingsSection.tsx:68`) reads `settings.warning` directly. Functional, but couples a transport-level concern (file unparsable) to the settings model. A separate `meta` field or a top-level `{ data, warning }` envelope would scale better if any second warning ever appears.

Fix: optional. Note for when a second warning surface lands.

### 12. `customFetch`-style hand-rolled hooks shipped for fs and settings

`packages/frontend/src/api/fs.ts`, `packages/frontend/src/api/settings.ts` — Same root cause as bug #3 (codegen not re-run). The hand-rolled hooks here are functional, but they encode the same query key conventions and envelope types that orval would generate, leading to two parallel patterns in the frontend API layer. Folded into the fix for #3.

---

## Non-issues

- **`ApiRequestError.body.error === "UUID_CONFLICT"` string-typed checks** (`LocateVaultDialog.tsx:54, 77`) — Brittle-looking but the error code is sourced from `packages/storage/src/registry/errors.ts` and the API route maps it to `error: "UUID_CONFLICT"` in the JSON body. Centralizing this into a typed constant would be marginal value.
- **Manifest-first ordering in `mode: "adopt"`** (`registry.ts:125-146`) — Looks risky (writes manifest before inserting), but the comment at line 126-128 explicitly defends it: a stale manifest file is recoverable; a ghost DB row is not. Different tradeoff from bug #1 because adopt operates on an existing user-owned directory, not a freshly-mkdir'd one.
- **`SettingsService.writeSettings` creates the file on first write** — Matches the spec at line 142 ("created on first write").
- **`mkdir -p` on the managed root if missing** — Matches FR-10 in the PRD (auto-create without prompting).
- **`useSettings` `staleTime: 60_000`** (`api/settings.ts:13`) — A user toggling the managed-root setting expects the new value to be live, but `usePatchSettings` calls `invalidateQueries` on success (line 25), so cache freshness is fine.
