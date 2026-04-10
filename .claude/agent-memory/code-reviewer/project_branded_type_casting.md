---
name: Branded UUID casting anti-pattern
description: Using `as never` to satisfy branded UUID types is a recurring pattern to flag
type: project
---

Three distinct `as never` anti-patterns, systemic across all route files:

**Pattern A — Response body cast: `ctx.json(value as never, statusCode)`**
Affects: fragments.ts, projects.ts, aspects.ts, references.ts, notes.ts.
Cause: `OpenAPIHono` enforces JSON body type matches Zod schema output — domain types (e.g. `Fragment`) use branded UUIDs while Zod infers plain `string`. Fix: either brand Zod schema with `.brand<"FragmentUUID">()` on `z.uuid()`, or cast to actual Zod output type (`z.infer<typeof FragmentSchema>`) instead of `never`.

**Pattern B — Error handler: `handleStorageError(error) as never`**
Affects: all catch blocks in route files + vault-index-routes.ts.
Cause: `handleStorageError` returns `Response`, not `TypedResponse` — incompatible with OpenAPIHono return type. Fix: change signature to `handleStorageError(error, ctx)` returning `ctx.json(...)`. CLAUDE.md already shows the correct signature but implementation doesn't match.

**Pattern C — Branded param cast: `fragmentId as FragmentUUID`**
Plain string from validated param cast to branded type. Lesser evil vs `as never`. Fix: use Zod `.brand<"FragmentUUID">()` on param schema to propagate the brand automatically.

**How to apply:** Fix order: (1) fix `handleStorageError` to accept ctx → eliminates Pattern B everywhere; (2) brand Zod schemas → eliminates Patterns A and C.

First observed: `packages/api/src/middleware/resolve-project.ts` and all `packages/api/src/routes/*.ts`.
