# API Package — Coding Guide

Runtime: **Bun**. Use `bun` / `bunx` / `bun test` throughout. Never use Node equivalents.

## Framework: OpenAPIHono

All routes use `@hono/zod-openapi`. Never use plain `Hono` or raw `Bun.serve()` routing.

```ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const router = new OpenAPIHono<{ Variables: AppVariables }>();

const myRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["MyEntity"],
  summary: "One-line description",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { content: { "application/json": { schema: MyEntitySchema } }, description: "ok" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "not found",
    },
  },
});

router.openapi(myRoute, async (ctx) => {
  const { id } = ctx.req.valid("param");
  // ...
  return ctx.json(result, 200);
});
```

- Use `ctx.req.valid("param" | "query" | "json")` — never `ctx.req.param()` or manual body parsing.
- Every route needs a `tags`, `summary`, and typed `responses` — these power the Swagger UI at `GET /ui`.

## Zod schemas

One file per entity in `src/schemas/`. Schemas describe the **API surface**, not internal storage types.

- Import `ErrorResponseSchema` from `src/schemas/error.ts` for all error responses.
- Keep internal fields (e.g. `contentHash`, `syncedAt`) out of response schemas unless the frontend needs them.

## App variables

```ts
type AppVariables = {
  storageService: StorageService;
  projectContext?: ProjectContext; // only set on project-scoped routes
};
```

- `storageService` is always present (set in `app.ts` middleware).
- `projectContext` is only present after `resolveProject` middleware runs (project-scoped routes).

## Project-scoped routes

Mount under `/projects/:projectId/`. The `resolveProject` middleware (`src/middleware/resolve-project.ts`) runs first and populates `ctx.var.projectContext`. Handlers call `ctx.get("projectContext")` — no direct registry calls from route files.

## Error handling

All storage errors go through `handleStorageError` from `src/errors.ts`. Never scatter `instanceof` checks across route files.

```ts
try {
  // ...
} catch (error) {
  return handleStorageError(error, ctx);
}
```

## Adding a new route group

1. Create `src/schemas/<entity>.ts` with request/response Zod schemas.
2. Create `src/routes/<entity>.ts` using `OpenAPIHono` + `createRoute`.
3. Mount the router in `src/app.ts`.
4. Add integration tests in `src/__tests__/routes/<entity>.test.ts` using `app.request()`.

## Testing

Use `app.request()` (in-process, no port binding) with a real `StorageService` pointed at a temp vault.

```ts
const response = await app.request("/projects/some-uuid/fragments");
```

Never mock `StorageService` — integration tests must hit real storage.
