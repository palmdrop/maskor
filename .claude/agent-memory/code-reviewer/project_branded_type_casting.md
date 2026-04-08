---
name: Branded UUID casting anti-pattern
description: Using `as never` to satisfy branded UUID types is a recurring pattern to flag
type: project
---

There are two distinct `as never` anti-patterns in the API routes — both are systemic across all route files.

**Pattern A — Response body cast: `ctx.json(value as never, statusCode)`**
Affects every route handler in: fragments.ts, projects.ts, aspects.ts, references.ts, notes.ts.
Root cause: `OpenAPIHono`'s `.openapi()` handler enforces that the returned JSON body type exactly matches the Zod schema inferred type declared in `createRoute()`. The domain types (e.g. `Fragment`) differ slightly from the Zod-inferred output (e.g. `FragmentSchema`) — for instance `Fragment` uses branded `FragmentUUID` while `FragmentSchema` infers a plain `string`. Rather than aligning the types, the author used `as never` to escape the constraint entirely.
Correct fix: Either (a) make the Zod schema output match the domain type exactly (use `.brand<"FragmentUUID">()` on z.uuid()), or (b) accept the mismatch and cast with the actual Zod output type (`z.infer<typeof FragmentSchema>`) rather than `never`.

**Pattern B — Error handler return: `handleStorageError(error) as never`**
Affects every catch block in all route files plus vault-index-routes.ts.
Root cause: `handleStorageError` returns `Response`, but `OpenAPIHono` handler return type expects a `TypedResponse` that matches the declared response schemas. `Response` is not assignable to `TypedResponse`, so the cast silences the mismatch.
Correct fix: Change `handleStorageError` signature to accept `ctx` and return `ctx.json(...)` using the typed Hono context, so the return type is a proper `TypedResponse`. The CLAUDE.md already shows the correct signature (`handleStorageError(error, ctx)`) but the implementation doesn't match.

**Pattern C — Branded UUID cast (original finding)**
`fragmentId as FragmentUUID`, `projectId as ProjectUUID` etc. — plain string from validated param cast to branded type.
These are technically `as BrandedType` not `as never`, so they are the lesser evil. Still: Zod `.brand<"FragmentUUID">()` on the param schema would propagate the brand automatically, eliminating the manual cast.

**How to apply:** Flag all three patterns in any route file review. The fix order: (1) fix `handleStorageError` to accept ctx — eliminates Pattern B everywhere; (2) brand the Zod schemas — eliminates Patterns A and C.

First observed: `packages/api/src/middleware/resolve-project.ts` and all `packages/api/src/routes/*.ts` files.
