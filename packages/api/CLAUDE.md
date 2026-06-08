Every state-changing API operation must go through `src/commands/`. Direct storage calls in route handlers are not allowed for mutations.

The pattern: define a command in `src/commands/<area>/<verb>-<noun>.ts`, export it from `src/commands/index.ts`, then call it from the route handler via `executeCommand(myCommand, commandLabel, commandContext, input)`. Read operations may call `storageService` directly.

`commandLabel` is the canonical backend domain label (e.g. `"fragment:update"`), typed as `CommandLabel`. Add new labels to `src/commands/command-labels.ts` — it's the single source of truth, so an unknown label is a compile error. The label is recorded as the `commandId` on a `command:error` action-log entry if the command throws (see below); it is not stored on the `Command` itself.

`commandContext` must carry the request's `correlationId` (`ctx.get("correlationId")`). Build it with the shared helper where one exists (e.g. `commandContextFrom(ctx)` in `routes/margins.ts`) or inline `correlationId: ctx.get("correlationId")`. `executeCommand` stamps it on every action-log entry, and on failure appends a `command:error` entry (then re-throws). See `references/adr/0012-command-failure-observability.md`.

Example to mirror:

- Command file: `src/commands/fragments/create-fragment.ts`
- Route usage: `src/routes/fragments.ts` (search for `executeCommand`)
- Plumbing: `src/commands/types.ts` (`Command`, `CommandContext`, `executeCommand`), `src/commands/command-labels.ts` (`CommandLabel`)

Exception: `swap.*` routes call `storageService.swap.*` directly. Swap files are a transient unsaved-content cache (see `references/plans/entity-content-swap-files.md`); they're not user actions and intentionally do not emit action log entries, so the commands pipeline adds no value.

## OpenAPI snapshot

This package owns the committed OpenAPI snapshot the frontend's orval codegen consumes. After you add or change a route (or its request/response schema), run `bun run generate-openapi` to refresh `packages/frontend/src/api/openapi.json`, then commit it. (From the repo root, `bun run codegen` does this and then runs orval in one step.) The snapshot is generated in-process from the route definitions (`src/scripts/generate-openapi.ts`) — no running server. `bun run verify:openapi` (also part of root `bun run verify`) regenerates the spec in-process and fails if it differs from the committed snapshot, so stale snapshots can't merge.
