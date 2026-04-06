# API + Storage Wiring

**Date**: 06-04-2026
**Status**: Done
**Implemented At**: 06-04-2026

---

## Goal

Wire `@maskor/storage`'s `StorageService` into `@maskor/api` using Hono. Serve vault data (fragments, aspects, notes, references, projects) over HTTP so the React frontend can consume it. This is the first real route implementation.

## Scope

- Install Hono, configure the server
- Add `@maskor/storage` as a dependency
- Implement a minimal but complete route set
- Standardise error handling and HTTP mapping
- Write integration tests using a real temp vault (see `@maskor/storage/fixtures/vault`)

Out of scope: auth, file watcher, import pipeline, sequencer, frontend integration.

---

## Architectural Decisions

### 1. Service injection — Hono context variables

Use Hono's typed context variables (`app.use` + `ctx.set`/`ctx.get`) to share the single `StorageService` instance across handlers.

**Why not a module-level singleton?** A module singleton makes test isolation hard — you can't swap the service between test runs without module cache tricks. Hono's context approach is explicit, typed, and testable.

**Pattern:**

```ts
type AppVariables = {
  storageService: StorageService;
  projectContext?: ProjectContext;
};

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", (ctx, next) => {
  ctx.set("storageService", storageService);
  return next();
});
```

The `storageService` instance is created once at startup and injected. Tests create their own instance with a temp config directory.

### 2. Project resolution — dedicated middleware on project-scoped routes

`resolveProject` is a plain middleware (not a factory) that runs on all routes under `/:projectId/`. It reads `storageService` from context via `ctx.get("storageService")` and `:projectId` from path params, resolves the project, attaches the result to Hono variables, and handlers read it with `ctx.get("projectContext")`. The service is already injected at the app level — no factory argument needed.

**Why not per-handler?** Duplication, and it forces every handler author to remember error handling for `ProjectNotFoundError`. Middleware centralises that.

**Why not global?** Not all routes are project-scoped (e.g. `GET /projects` to list projects). The middleware should only apply to the nested sub-app.

```ts
type AppVariables = {
  storageService: StorageService;
  projectContext?: ProjectContext; // only set on project-scoped routes
};
```

`projectContext` is typed as optional because routes like `GET /projects` never set it. Project-scoped handlers can assert it is defined after the middleware guarantees it (or use a narrowing check). Do not type it as required — TypeScript would lie to callers on non-project-scoped routes.

### 3. Route scope — minimal but complete first milestone

Project registry routes (no context required):

```
GET    /projects                     — list all registered projects
GET    /projects/:projectId          — get a single project record
POST   /projects                     — register a new project (name + vaultPath) → 201
DELETE /projects/:projectId          — remove a project
```

Fragment routes (project-scoped):

```
GET    /projects/:projectId/fragments              — list all (indexed, no body)
GET    /projects/:projectId/fragments/:fragmentId  — read one (full body)
GET    /projects/:projectId/fragments?pool=poolname — filter by pool (query param on list)
POST   /projects/:projectId/fragments              — write a fragment → 201
DELETE /projects/:projectId/fragments/:fragmentId  — discard a fragment
```

Aspect, note, reference routes (read-only for milestone 1):

```
GET    /projects/:projectId/aspects
GET    /projects/:projectId/aspects/:aspectId
GET    /projects/:projectId/notes
GET    /projects/:projectId/notes/:noteId
GET    /projects/:projectId/references
GET    /projects/:projectId/references/:referenceId
```

Index route:

```
POST   /projects/:projectId/index/rebuild
```

**POST /projects request body:**

```json
{ "name": "My project", "vaultPath": "/absolute/path/to/vault" }
```

`vaultPath` is a raw filesystem path. See deferred note in Open Questions.

**POST /projects/:projectId/fragments request body:**

```json
{ "title": "Fragment title", "content": "Markdown body", "pool": "default" }
```

The server generates the UUID. The `StorageService.fragments.write` method takes a full `Fragment` — the API handler assembles one from the request body fields and a freshly-generated UUID before calling write. The created fragment (including its UUID) is returned in the 201 response.

**What's deferred:** piece consumption (`/pieces`), write endpoints for aspects/notes/references — they exist in storage but aren't needed until the frontend requests them. Add them when needed, don't preemptively scaffold them.

### 4. Error taxonomy — map storage errors to HTTP at the handler boundary

Index staleness and filesystem inconsistencies are **storage service concerns**, not API concerns. The API should never need to reason about whether the index is stale. The storage service is responsible for detecting and surfacing these as domain-level errors.

**Required storage service change (prerequisite):**
Add `"STALE_INDEX"` to `VaultErrorCode` in `packages/storage/src/vault/types.ts`. In `storage-service.ts`, wrap the `vault.*.read(filePath)` call in `fragments.read`, `aspects.read`, `notes.read`, and `references.read` in a try/catch and unconditionally re-throw any `FILE_NOT_FOUND` error as `VaultError("STALE_INDEX", ...)`. At that callsite the path is always index-derived — there is no ambiguity to detect. Do not add conditional logic to distinguish "direct path" vs "index path"; the distinction does not exist at that call site.

**Error mapping in the API:**

- `ProjectNotFoundError` (from `registry/errors.ts`) → **404**
- `VaultError` — code-dependent:
  - `FRAGMENT_NOT_FOUND`, `ENTITY_NOT_FOUND` → **404**
  - `STALE_INDEX` → **404** with informational hint (see below)
  - all others → **500**

`STALE_INDEX` maps to **404**, not 409. The resource is effectively absent from the API's perspective. 409 Conflict implies a clash between two valid states — that is not what is happening here. The decision is settled; do not revisit at implementation time.

Define a single `handleStorageError(error: unknown): Response` utility in `src/errors.ts`. Every handler passes unknown errors through it. Do not scatter `instanceof` checks across route files.

**Response shape for errors:**

```json
{ "error": "NOT_FOUND", "message": "Fragment not found: <uuid>" }
```

**Stale index 404 includes a hint — informational only, not a contract:**

```json
{ "error": "NOT_FOUND", "message": "Fragment not found: <uuid>", "hint": "index_may_be_stale" }
```

No envelope for success responses — return data directly. Arrays at the top level are fine. `POST` routes that create resources return 201 with the created entity body.

### 5. Rebuild trigger — explicit route, no automatic rebuild

Expose `POST /projects/:projectId/index/rebuild` explicitly. Do not trigger rebuilds automatically on write or discard.

**Why not automatic?** Rebuilds are synchronous and potentially slow. Callers (the frontend) need control over when they happen. Automatic rebuilds on every write would make the write endpoints unpredictably slow and mask the eventual watcher transition.

**Tradeoff:** callers must know to rebuild after mutations. That's acceptable — the frontend is the only consumer, and it's in-project. Document the contract clearly in the route handler comment.

**When the watcher is added**, the rebuild route stays but becomes mostly unnecessary. The watcher will trigger incremental index updates on file change events. The explicit route remains as a manual override.

### 6. Testing approach — integration tests with a real temp vault

Use Hono's `app.request()` for in-process HTTP testing — no network, no port binding, but real Hono middleware and routing. Create a temp vault with a seeded test fixture. Use the real `StorageService` pointed at that temp directory.

**Why not mocks?** The project explicitly values real integration. Mocking the service tests only routing, not the storage contract. Every gap between mock and real behaviour is a future bug.

**Why not a full network server?** `app.request()` is faster, avoids port conflicts, and tests the same code path without the OS network stack.

`createTestApp` returns a `{ app, cleanup }` tuple. Tests call `cleanup()` in `afterAll` to remove the temp directory. This is important for test isolation — do not leave cleanup implicit or rely on the test runner to handle it.

Test structure:

```
packages/api/src/__tests__/
  routes/
    projects.test.ts
    fragments.test.ts
    aspects.test.ts
    notes.test.ts
    references.test.ts
    index.test.ts
  helpers/
    create-test-app.ts   — builds app with temp storageService, returns { app, cleanup }
    seed-vault.ts        — writes fixture fragments/aspects into temp vault
```

---

## Note on Hono vs Bun.serve()

The `api` package `CLAUDE.md` says "don't use express" and implies Bun-native APIs. Hono wraps `Bun.serve()` under the hood — it is not Express. It uses the same Fetch API request/response model. This is not a conflict. Hono is the right call here: middleware composition, typed context variables, and `app.request()` testability are worth the dependency. `Bun.serve()` raw would require hand-rolling all of that.

---

## File-by-File Change List

### `packages/storage/src/vault/types.ts` (prerequisite change)

- Add `"STALE_INDEX"` to `VaultErrorCode`
- Thrown by service methods when UUID resolves to an index path that doesn't exist on disk — keeps filesystem details out of the API layer

### `packages/storage/src/service/storage-service.ts` (prerequisite change)

- In `fragments.read`, `fragments.discard`, `aspects.read`, `notes.read`, `references.read`: wrap the `vault.*.read(filePath)` call in a try/catch and unconditionally re-throw `FILE_NOT_FOUND` as `VaultError("STALE_INDEX", ...)`
- No conditional logic is needed — the path at that callsite is always index-derived

### `packages/api/package.json`

- Add `hono` as a dependency
- Add `@maskor/storage` as a workspace dependency

### `packages/api/src/app.ts` (new)

- Create and export `createApp(storageService: StorageService): Hono`
- Registers all middleware (including CORS) and routes
- CORS belongs here, not in `index.ts` — it must be present when tests call `createApp` directly
- Separated from `index.ts` so tests can call `createApp` without binding a port

### `packages/api/src/index.ts`

- Replace stub with Hono app wiring and `Bun.serve()` call
- Read port from `process.env.PORT` with a sensible default (e.g. 3001)
- Does not register middleware — delegates to `createApp`

### `packages/api/src/errors.ts` (new)

- `handleStorageError(error: unknown): Response` — maps `ProjectNotFoundError` and `VaultError` codes to HTTP status + JSON body
- Exported and used in all route handlers

### `packages/api/src/middleware/resolve-project.ts` (new)

- Plain Hono middleware (not a factory): reads `storageService` from `ctx.get("storageService")` and `:projectId` from path params, calls `resolveProject`, sets `projectContext` on `ctx`
- Returns 404 JSON if `ProjectNotFoundError` is thrown

### `packages/api/src/routes/projects.ts` (new)

- `GET /` — `listProjects()`
- `GET /:projectId` — `getProject(uuid)`, returns single project record
- `POST /` — `registerProject(name, vaultPath)` from request body, returns 201 with created project
- `DELETE /:projectId` — `removeProject(uuid)`

### `packages/api/src/routes/fragments.ts` (new)

- All fragment routes (list, get, write, discard)
- Pool filter via `?pool=poolname` query param on `GET /`
- `POST /` assembles a full `Fragment` from body fields + server-generated UUID, returns 201 with created fragment
- After write/discard: do NOT auto-rebuild. Index staleness is the caller's responsibility — document it in the handler comment

### `packages/api/src/routes/aspects.ts` (new)

- `GET /` and `GET /:aspectId` only (read-only for now)

### `packages/api/src/routes/notes.ts` (new)

- `GET /` and `GET /:noteId` only (read-only for now)

### `packages/api/src/routes/references.ts` (new)

- `GET /` and `GET /:referenceId` only (read-only for now)

### `packages/api/src/routes/vault-index-routes.ts` (new)

- `POST /rebuild` (mounted at `/projects/:projectId/index`)
- Returns `RebuildStats` as JSON

### `packages/api/src/__tests__/helpers/create-test-app.ts` (new)

- Creates a temp config directory, instantiates `StorageService`, calls `createApp`
- Returns `{ app, cleanup }` tuple — callers must invoke `cleanup()` in `afterAll` to remove the temp directory
- This is required for test isolation; do not leave teardown implicit

### `packages/api/src/__tests__/helpers/seed-vault.ts` (new)

- Utility to register a test project and write fixture data (a few fragments, an aspect, a note)
- Returns the `ProjectRecord` so tests can use the UUID

### `packages/api/src/__tests__/routes/*.test.ts` (new)

- One file per route group, using `app.request()` for in-process HTTP calls
- Each test suite calls `cleanup()` in `afterAll`
- Covers: success cases, 404 on unknown UUID, 400 on missing body fields, 201 on creation

---

## Open Questions / Deferred Decisions

1. **Write endpoints for aspects/notes/references** — storage supports them, but defer until the frontend actually needs them. Don't scaffold what won't be used.

2. **Request body validation** — Hono doesn't validate request bodies out of the box. For milestone 1, manual checks with early 400 returns are fine. If bodies grow complex, consider `zod` with `@hono/zod-validator`. Defer.

3. **Port configuration** — hardcoding `3001` is fine for now. When the frontend is wired up, make sure both agree on the port or drive it from a shared env file.

4. **Logging** — `@maskor/shared` exports a pino logger factory. Wire it into the API but don't go deep on structured logging yet. A single logger instance on the app is enough.

5. **`vaultPath` in `POST /projects` body** — `vaultPath` is a raw filesystem path. For a local app this is fine, but the frontend (even in Tauri/Electron) must know the path to supply it. Deferred options: read from a config file, expose a file picker over IPC, or add a path-validation/discovery endpoint. Do not leave this implicit when frontend integration begins.

---

## Implementation Order

1. Install deps (`hono`, `@maskor/storage`)
2. Add `"STALE_INDEX"` to `VaultErrorCode` and update `storage-service.ts` (prerequisite)
3. Create `errors.ts` and `middleware/resolve-project.ts`
4. Create `app.ts` with CORS and route mounting
5. Implement route files (projects → fragments → aspects/notes/references → vault-index-routes)
6. Wire `index.ts` with `Bun.serve()`
7. Write test helpers (`create-test-app.ts`, `seed-vault.ts`)
8. Write integration tests per route group
9. Run `bun run test` and `bun run format`
