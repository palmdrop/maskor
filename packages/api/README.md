# @maskor/api

HTTP API for the Maskor writing tool. Built with Hono on Bun. Serves vault data (fragments, aspects, notes, references, projects) from `@maskor/storage`.

## Running

```bash
bun src/index.ts
# or
PORT=3001 bun src/index.ts
```

## Routes

### Projects (no project context required)

```
GET    /projects                         — list all registered projects
GET    /projects/:projectId              — get project context by UUID
POST   /projects                         — register { name, vaultPath } → 201
DELETE /projects/:projectId              — remove a project
```

### Fragments (project-scoped)

```
GET    /projects/:projectId/fragments                        — list all indexed fragments
GET    /projects/:projectId/fragments/:fragmentId            — read one fragment
POST   /projects/:projectId/fragments                        — write { title, content } → 201
PATCH  /projects/:projectId/fragments/:fragmentId            — update fragment fields
DELETE /projects/:projectId/fragments/:fragmentId            — discard a fragment (move to discarded/)
POST   /projects/:projectId/fragments/:fragmentId/restore    — restore a discarded fragment
```

### Aspects / Notes / References (read-only)

```
GET    /projects/:projectId/aspects
GET    /projects/:projectId/aspects/:aspectId
GET    /projects/:projectId/notes
GET    /projects/:projectId/notes/:noteId
GET    /projects/:projectId/references
GET    /projects/:projectId/references/:referenceId
```

### Index

```
POST   /projects/:projectId/index/rebuild  — triggers a full index rebuild, returns RebuildStats
```

## Error shape

```json
{ "error": "NOT_FOUND", "message": "Fragment not found: <uuid>" }
{ "error": "NOT_FOUND", "message": "...", "hint": "index_may_be_stale" }
{ "error": "INTERNAL_ERROR", "message": "..." }
```

## Testing

```bash
bun test
```

Tests use `app.request()` (in-process, no port) with a real `StorageService` pointed at a temp directory seeded from `@packages/text-fixtures/vault`.

## Architecture

- `src/app.ts` — `createApp(storageService)`: registers CORS, injects service, mounts routes
- `src/errors.ts` — `handleStorageError`: maps `VaultError` / `ProjectNotFoundError` to HTTP
- `src/middleware/resolve-project.ts` — resolves `:projectId` param to `ProjectContext` before project-scoped handlers
- `src/routes/` — one file per resource
- `src/index.ts` — creates `StorageService`, calls `createApp`, starts `Bun.serve`
