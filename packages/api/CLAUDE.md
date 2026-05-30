Every state-changing API operation must go through `src/commands/`. Direct storage calls in route handlers are not allowed for mutations.

The pattern: define a command in `src/commands/<area>/<verb>-<noun>.ts`, export it from `src/commands/index.ts`, then call it from the route handler via `executeCommand(myCommand, commandContext, input)`. Read operations may call `storageService` directly.

Example to mirror:

- Command file: `src/commands/fragments/create-fragment.ts`
- Route usage: `src/routes/fragments.ts` (search for `executeCommand`)
- Plumbing: `src/commands/types.ts` (`Command`, `CommandContext`, `executeCommand`)

Exception: `swap.*` routes call `storageService.swap.*` directly. Swap files are a transient unsaved-content cache (see `references/plans/entity-content-swap-files.md`); they're not user actions and intentionally do not emit action log entries, so the commands pipeline adds no value.

## OpenAPI snapshot

This package owns the committed OpenAPI snapshot the frontend's orval codegen consumes. After you add or change a route (or its request/response schema), run `bun run generate-openapi` to refresh `packages/frontend/src/api/openapi.json`, then commit it. (From the repo root, `bun run codegen` does this and then runs orval in one step.) The snapshot is generated in-process from the route definitions (`src/scripts/generate-openapi.ts`) — no running server. `bun run verify:openapi` (also part of root `bun run verify`) regenerates to a temp file and fails if it differs from the committed snapshot, so stale snapshots can't merge.
