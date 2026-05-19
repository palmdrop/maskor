Every state-changing API operation must go through `src/commands/`. Direct storage calls in route handlers are not allowed for mutations.

The pattern: define a command in `src/commands/<area>/<verb>-<noun>.ts`, export it from `src/commands/index.ts`, then call it from the route handler via `executeCommand(myCommand, commandContext, input)`. Read operations may call `storageService` directly.

Example to mirror:

- Command file: `src/commands/fragments/create-fragment.ts`
- Route usage: `src/routes/fragments.ts` (search for `executeCommand`)
- Plumbing: `src/commands/types.ts` (`Command`, `CommandContext`, `executeCommand`)

Exception: `swap.*` routes call `storageService.swap.*` directly. Swap files are a transient unsaved-content cache (see `references/plans/entity-content-swap-files.md`); they're not user actions and intentionally do not emit action log entries, so the commands pipeline adds no value.
