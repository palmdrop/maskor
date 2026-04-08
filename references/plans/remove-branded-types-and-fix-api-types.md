# Remove Branded Types & Fix API Type Safety

**Date**: 07-04-2026
**Status**: Done
**Implemented At**: 07-04-2026

---

## Goal

Two related problems, one plan:

1. **Branded UUID types are more friction than protection.** Every boundary that produces a UUID string — vault mappers, indexer assemblers, route handlers, tests — requires an explicit `as FragmentUUID` cast. The casts are noise. Passing the wrong UUID kind across a boundary is caught by code review and tests, not the type system, in practice.

2. **`as never` is used throughout the API routes** to silence type errors caused by mismatches between domain types, Zod schemas, and Hono's typed response system. These need to be resolved properly.

---

## Part 1 — Remove branded UUID types

### What to remove

All branded UUID type aliases in `packages/shared/src/types/domain/`:

| File              | Remove                                     |
| ----------------- | ------------------------------------------ |
| `fragment.ts`     | `FragmentUUID = Brand<UUID, "fragment">`   |
| `aspect.ts`       | `AspectUUID = Brand<UUID, "aspect">`       |
| `note.ts`         | `NoteUUID = Brand<UUID, "note">`           |
| `reference.ts`    | `ReferenceUUID = Brand<UUID, "reference">` |
| `project.ts`      | `ProjectUUID = Brand<UUID, "project">`     |
| `user.ts`         | `UserUUID = Brand<UUID, "user">`           |
| `sequence.ts`     | `SectionUUID`, `SequenceUUID`              |
| `arc.ts`          | `ArcUUID`                                  |
| `interleaving.ts` | `InterleavingUUID`                         |

Replace each with `type FragmentUUID = string` (and so on). This preserves the names — callers still use `FragmentUUID` in type annotations as documentation of intent, but TypeScript treats them as plain `string`, requiring no casts.

**Keep the `UUID` template literal type** in `utils/uuid.ts` as a documentation-only alias — it signals "this is a UUID-shaped string" without enforcing it. Optionally remove it too; the choice has no runtime impact.

### What to remove from `packages/shared/package.json`

Remove the `ts-brand` dependency entirely once no branded types remain.

### What changes in consumers

Every `as FragmentUUID`, `as ProjectUUID`, etc. cast becomes unnecessary and can be deleted. Affected files:

- `packages/storage/src/vault/markdown/mappers/*.ts` — `uuid: frontmatter.uuid as FragmentUUID` → `uuid: frontmatter.uuid`
- `packages/storage/src/indexer/assemblers.ts` — same pattern
- `packages/storage/src/indexer/indexer.ts` — `row.uuid as NoteUUID`, `row.uuid as ReferenceUUID`, etc.
- `packages/storage/src/registry/registry.ts` — `uuid as ProjectUUID`, `userUuid as UserUUID`
- `packages/storage/src/registry/types.ts` — `"local" as UserUUID` → `"local"`
- `packages/api/src/routes/*.ts` — `fragmentId as FragmentUUID`, `projectId as ProjectUUID`, etc.
- `packages/api/src/middleware/resolve-project.ts` — `projectId as ProjectUUID`
- All test files with branded casts

---

## Part 2 — Fix `as never` in API routes

After Part 1, branded casts are gone but two other `as never` causes remain.

### 2a. Fix `handleStorageError` — accept `ctx`, use `ctx.json()`

**Current:**

```ts
export const handleStorageError = (error: unknown): Response
// used as:
return handleStorageError(error) as never;
```

`handleStorageError` returns a raw `Response`. `OpenAPIHono` handlers must return a `TypedResponse`. The cast suppresses the incompatibility.

**Fix:** Accept `ctx` and use `ctx.json()`:

```ts
import type { Context } from "hono";

export const handleStorageError = (error: unknown, ctx: Context): Response => {
  if (error instanceof ProjectNotFoundError) {
    return ctx.json({ error: "NOT_FOUND", message: error.message }, 404);
  }
  if (error instanceof VaultError) {
    switch (error.code) {
      case "FRAGMENT_NOT_FOUND":
      case "ENTITY_NOT_FOUND":
        return ctx.json({ error: "NOT_FOUND", message: error.message }, 404);
      case "STALE_INDEX":
        return ctx.json(
          { error: "NOT_FOUND", message: error.message, hint: "index_may_be_stale" },
          404,
        );
      default:
        return ctx.json({ error: "INTERNAL_ERROR", message: error.message }, 500);
    }
  }
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return ctx.json({ error: "INTERNAL_ERROR", message }, 500);
};
```

Update all call sites:

```ts
return handleStorageError(error, ctx);
```

`ctx.json()` returns a `TypedResponse`, which satisfies `OpenAPIHono`'s return type. The `as never` cast is no longer needed.

### 2b. Fix `ctx.json(value as never, 200)` — declare all response codes in `createRoute`

**Root cause:** `OpenAPIHono` infers the exact allowed response types from the `responses` block in `createRoute()`. When only `200` is declared and the handler can also return `404` or `500` (via `handleStorageError`), TypeScript complains about the catch branch return type, and the main branch gets cast to `never` as a side-effect.

**Fix:** Declare all response codes used by the handler in `createRoute()`:

```ts
const getFragmentRoute = createRoute({
  // ...
  responses: {
    200: { content: { "application/json": { schema: FragmentSchema } }, description: "Fragment" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});
```

With all branches typed, `ctx.json(fragment, 200)` is assignable without a cast.

Apply to all routes. The common pattern is 200/201 + 404 + 500. Discard/delete routes use 204 + 404 + 500.

### 2c. Fix 204 responses — use `ctx.body(null, 204)`

**Current:**

```ts
return new Response(null, { status: 204 }) as never;
```

**Fix:**

```ts
return ctx.body(null, 204);
```

`ctx.body()` returns a `TypedResponse`. Declare `204: { description: "Deleted" }` (no content) in the `createRoute` responses block.

### 2d. Fix `FragmentSchema` — split read schema from create response schema

**Problem:** `FragmentSchema` includes `filePath: z.string()`, but the POST `/fragments` handler returns the fragment as written to the vault — it has no `filePath` (that field is populated by the indexer after rebuild). The 201 response claims a shape it cannot deliver.

**Fix:** Two schemas:

```ts
// GET responses — indexed fragment, has filePath and resolved properties
export const IndexedFragmentSchema = z
  .object({
    uuid: z.string(),
    title: z.string(),
    version: z.number().int(),
    pool: PoolSchema,
    readyStatus: z.number().min(0).max(1),
    contentHash: z.string(),
    filePath: z.string(), // from indexer
    properties: z.record(z.string(), IndexedFragmentPropertySchema), // resolved
    notes: z.array(z.string()),
    references: z.array(z.string()),
  })
  .openapi("IndexedFragment");

// POST 201 response — just-written fragment, no filePath or resolved properties
export const FragmentSchema = z
  .object({
    uuid: z.string(),
    title: z.string(),
    version: z.number().int(),
    pool: PoolSchema,
    readyStatus: z.number().min(0).max(1),
    contentHash: z.string(),
    notes: z.array(z.string()),
    references: z.array(z.string()),
    properties: z.record(z.string(), z.object({ weight: z.number() })),
  })
  .openapi("Fragment");
```

- List (`GET /fragments`) and get (`GET /fragments/:id`) use `IndexedFragmentSchema`
- Create (`POST /fragments`) 201 response uses `FragmentSchema`

---

## Implementation order

1. Replace branded type aliases with `string` aliases in `packages/shared/src/types/domain/`
2. Remove `ts-brand` from `packages/shared/package.json`
3. Delete all `as XxxUUID` casts across storage and api packages
4. Split `FragmentSchema` into `FragmentSchema` + `IndexedFragmentSchema` in `src/schemas/fragment.ts`
5. Add missing response codes (404, 500, 204) to all `createRoute()` definitions
6. Fix `handleStorageError` to accept and use `ctx`
7. Update all `handleStorageError(error)` call sites → `handleStorageError(error, ctx)`
8. Replace `new Response(null, { status: 204 })` with `ctx.body(null, 204)`
9. Run `bun run typecheck` — all `as never` casts should now be unnecessary; remove any that remain
10. Run `bun run test` and `bun run format`

---

## What this does NOT change

- No runtime behaviour changes. All values are still UUID-shaped strings; the domain types are just annotations now.
- `StorageService` public API is unchanged.
- Zod validation in routes is unchanged — `z.uuid()` still validates the format at the HTTP boundary.
- Test fixtures that used `"some-uuid" as FragmentUUID` just become `"some-uuid"`.

---

## Trade-off: what we lose

Branded types would catch `service.fragments.read(ctx, aspectUUID)` (wrong UUID kind) at compile time. With plain `string`, that's a runtime error. In practice, every call site is either reading from a trusted source (DB row, vault frontmatter) or a route param validated as `z.uuid()` — the opportunity for confusion is low, and the existing test coverage catches misuse. The ergonomic cost of the casts exceeds the safety benefit here.
