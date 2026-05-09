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

### Aspects / Notes / References

```
GET    /projects/:projectId/aspects
GET    /projects/:projectId/aspects/:aspectId
POST   /projects/:projectId/aspects                        — create aspect
PATCH  /projects/:projectId/aspects/:aspectId             — update/rename aspect
DELETE /projects/:projectId/aspects/:aspectId             — delete aspect
GET    /projects/:projectId/notes
GET    /projects/:projectId/notes/:noteId
POST   /projects/:projectId/notes                         — create note
PATCH  /projects/:projectId/notes/:noteId                 — update/rename note
DELETE /projects/:projectId/notes/:noteId                 — delete note
GET    /projects/:projectId/references
GET    /projects/:projectId/references/:referenceId
POST   /projects/:projectId/references                    — create reference
PATCH  /projects/:projectId/references/:referenceId       — update/rename reference
DELETE /projects/:projectId/references/:referenceId       — delete reference
```

### Action Log

```
GET    /projects/:projectId/action-log?limit=N            — list recent entries, most-recent-first (default 50, max 500)
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
- `src/commands/` — command pattern for state-changing mutations (see below)
- `src/index.ts` — creates `StorageService`, calls `createApp`, starts `Bun.serve`

## Command pattern

Every state-changing API route **must** delegate to a command in `src/commands/`. Direct storage calls in route handlers are not allowed for mutations.

Commands live in `src/commands/<domain>/`. Each command:
1. Performs the storage mutation.
2. Returns the mutation result and a list of `LogEntry` objects to append.

`executeCommand(command, ctx, input)` orchestrates this: it runs the command, then appends each returned log entry via `storageService.actionLog.append`. If the mutation fails, the error propagates normally (no log entry). If the mutation succeeds but a log append fails, the failure is swallowed and logged at `error` level — the API response always returns the mutation result.
