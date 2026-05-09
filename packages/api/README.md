# @maskor/api

HTTP API for the Maskor writing tool. Built with Hono on Bun. Serves vault data (fragments, aspects, notes, references, projects) from `@maskor/storage`.

## Running

```bash
bun src/index.ts
# or
PORT=3001 bun src/index.ts
```

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
