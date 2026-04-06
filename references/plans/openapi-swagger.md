# OpenAPI + Swagger UI

**Date**: 06-04-2026
**Status**: Done
**Implemented At**: 06-04-2026

## Goal

Annotate all API routes with OpenAPI 3.1 metadata and expose a live Swagger UI for interactive testing. Kill two birds with one stone by replacing the manual `if (!field)` request validation with Zod schemas that double as the spec source.

---

## Chosen approach: `@hono/zod-openapi` + `@hono/swagger-ui`

Hono's first-party OpenAPI package wraps every route in a `createRoute()` definition that:

- declares Zod schemas for request params, query, body, and responses
- validates requests automatically (replaces manual `if (!field)` checks)
- generates the OpenAPI JSON spec at runtime via `app.getOpenAPIDocument()`

`@hono/swagger-ui` serves the Swagger UI as a single middleware — no static files needed.

### Why not hand-write the YAML?

The schema would immediately drift from the code. Keeping Zod schemas as the single source of truth means the spec is always in sync.

### Why `@hono/zod-openapi` over `hono-openapi`?

`@hono/zod-openapi` is the official Hono package with active maintenance and direct `getOpenAPIDocument()` support. `hono-openapi` is community-driven and adds more runtime adapters we don't need.

---

## New dependencies

```
@hono/zod-openapi  ^1.2.4
@hono/swagger-ui   ^0.6.1
zod                ^3.x
```

---

## What changes

### 1. Route files → `OpenAPIHono` + `createRoute`

Each route file switches from `new Hono<...>()` to `new OpenAPIHono<...>()` and from `.get/.post/.delete()` to `.openapi(route, handler)`.

A route definition looks like:

```ts
import { createRoute, z } from "@hono/zod-openapi";

const listFragmentsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Fragments"],
  request: {
    query: z.object({ pool: z.string().optional() }),
  },
  responses: {
    200: { content: { "application/json": { schema: z.array(IndexedFragmentSchema) } }, description: "ok" },
  },
});

fragmentsRouter.openapi(listFragmentsRoute, async (ctx) => { ... });
```

The handler is type-safe: `ctx.req.valid("json")` returns the Zod-parsed body, `ctx.req.valid("param")` returns parsed params. No more manual `if (!field)` guards.

### 2. `app.ts` → `OpenAPIHono` + spec endpoint + Swagger UI

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";

const app = new OpenAPIHono<...>();

// ... existing middleware + route mounting ...

app.doc("/doc", {
  openapi: "3.1.0",
  info: { title: "Maskor API", version: "0.1.0" },
});

app.get("/ui", swaggerUI({ url: "/doc" }));
```

Two new public routes:

- `GET /doc` — returns the OpenAPI JSON spec
- `GET /ui` — Swagger UI (HTML page)

### 3. Zod schemas

Create `src/schemas/` with one file per domain entity. These describe the API surface, not the full internal types:

```
src/schemas/
  fragment.ts   — FragmentWriteSchema (POST body), FragmentSchema (response)
  project.ts    — ProjectCreateSchema, ProjectSchema
  error.ts      — ErrorResponseSchema (shared)
```

Internal types like `contentHash`, `updatedAt`, `properties` can stay internal and be stripped from API responses, or included — decide per entity.

### 4. `handleStorageError` stays

Error mapping logic doesn't need to change. Validation errors from Zod are handled automatically by `@hono/zod-openapi` and return a `400` with a structured body — no overlap with `handleStorageError`.

---

## File map

| File                                            | Change                                                 |
| ----------------------------------------------- | ------------------------------------------------------ |
| `packages/api/package.json`                     | add `@hono/zod-openapi`, `@hono/swagger-ui`, `zod`     |
| `packages/api/src/app.ts`                       | `OpenAPIHono`, add `/doc` and `/ui`                    |
| `packages/api/src/schemas/`                     | new — Zod schemas for each entity                      |
| `packages/api/src/routes/fragments.ts`          | `OpenAPIHono`, `createRoute`, remove manual validation |
| `packages/api/src/routes/projects.ts`           | same                                                   |
| `packages/api/src/routes/aspects.ts`            | same                                                   |
| `packages/api/src/routes/notes.ts`              | same                                                   |
| `packages/api/src/routes/references.ts`         | same                                                   |
| `packages/api/src/routes/vault-index-routes.ts` | same                                                   |
| `packages/api/src/__tests__/`                   | add `GET /doc` smoke test; other tests unchanged       |

---

## Open questions / deferred

1. **Response schema strictness** — Internal `Fragment` fields like `contentHash` and `updatedAt` are API noise. We can either strip them (a separate response mapper) or expose them as-is. Defer until the frontend says it cares.

2. **Auth / security schemes** — `@hono/zod-openapi` supports OpenAPI `securitySchemes`. Don't add now, but the structure is ready for it.

3. **Spec versioning** — `version: "0.1.0"` is a placeholder. Tie to `package.json` version when that matters.

4. **Re-export Zod schemas from `@maskor/shared`** — Shared types (Fragment, Aspect, etc.) are TypeScript-only. If we ever want a single Zod schema that works across packages (e.g. for the frontend), it should live in `@maskor/shared`. Defer until needed.

---

## Implementation order

1. Install deps
2. Create `src/schemas/error.ts` and `src/schemas/project.ts`
3. Migrate `routes/projects.ts` first (simplest, good template)
4. Create remaining schemas (`fragment.ts`, `aspect.ts`, `note.ts`, `reference.ts`)
5. Migrate remaining route files
6. Update `app.ts` — swap `Hono` → `OpenAPIHono`, add `/doc` + `/ui`
7. Add smoke test for `GET /doc`
8. Run `bun test` and `bun run typecheck`
