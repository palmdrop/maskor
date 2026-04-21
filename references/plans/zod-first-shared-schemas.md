# Zod-First Schemas in @maskor/shared

**Date**: 21-04-2026
**Status**: Done
**Implemented At**: 21-04-2026

## Problem

Every domain entity has its shape defined in two places:

1. `@maskor/shared` — plain TypeScript type declarations (`type Fragment = { ... }`)
2. `packages/api/src/schemas/` — Zod schemas that repeat the same shape + add `.openapi()` annotations

When the domain model changes, both must be updated in sync. There is no compiler enforcement of this — they can silently drift.

Drizzle schemas are a separate concern (DB shape ≠ domain shape; assemblers bridge them) and are **not** part of this plan.

---

## Goal

Make Zod schemas the single source of truth for domain types. Derive TypeScript types via `z.infer<>`. The API layer only adds API-surface concerns on top (`.openapi()` annotations, serialized dates, indexed fields).

---

## Architecture after this change

```
@maskor/shared
  └── src/schemas/domain/
        fragment.ts      ← z.object(...); export type Fragment = z.infer<...>
        aspect.ts
        note.ts
        reference.ts
        project.ts
        index.ts

packages/api/src/schemas/
        fragment.ts      ← imports from shared, adds .openapi(), extends for API deviations
        aspect.ts
        ...
```

Orval continues generating API-aligned TypeScript types from the OpenAPI spec — no change to the codegen pipeline. The frontend's primary type source remains Orval-generated types. Direct imports from `@maskor/shared` are only useful in rare cases where a future form shape matches the domain schema exactly; no existing form qualifies today.

---

## Key design decision: API schemas vs domain schemas differ in some cases

These deviations are intentional and the API schemas must still handle them:

| Field                                        | Domain (shared)                 | API response                                                                                |
| -------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `updatedAt`                                  | `Date`                          | `string` (ISO serialized)                                                                   |
| `createdAt`                                  | `Date`                          | `string`                                                                                    |
| `IndexedFragment.filePath`                   | does not exist                  | storage-internal, exposed in list responses                                                 |
| `IndexedAspect.filePath`                     | does not exist                  | same                                                                                        |
| `Fragment.content`                           | `Markdown` (alias for `string`) | `string`                                                                                    |
| `IndexedFragment.properties[key].aspectUuid` | does not exist                  | DB-resolved enrichment — aspect title→UUID resolved at indexer layer, not a domain property |

Rule: shared schemas describe the **domain model** (what the app thinks about). API schemas describe the **wire format** (what clients receive).

---

## Implementation steps

### 1. Add `zod` to `@maskor/shared`

```bash
cd packages/shared && bun add zod
```

### 2. Create `src/schemas/domain/` in shared

One file per entity. Convert existing type declarations to `z.object()` + `z.infer<>`. Keep the same field names and semantics.

```ts
// packages/shared/src/schemas/domain/fragment.ts
import { z } from "zod";

export const FragmentPropertiesSchema = z.record(z.string(), z.object({ weight: z.number() }));

export const FragmentSchema = z.object({
  uuid: z.uuid(), // Zod v4: z.uuid() not z.string().uuid()
  version: z.int(), // Zod v4: z.int() not z.number().int()
  title: z.string(),
  content: z.string(),
  readyStatus: z.number().min(0).max(1),
  contentHash: z.string(),
  updatedAt: z.date(),
  notes: z.array(z.string()),
  references: z.array(z.string()),
  isDiscarded: z.boolean(),
  properties: FragmentPropertiesSchema,
});

export type FragmentProperties = z.infer<typeof FragmentPropertiesSchema>;
export type Fragment = z.infer<typeof FragmentSchema>;

// Subset schemas for reuse in API layer
export const FragmentCreateSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

export const FragmentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  readyStatus: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  properties: FragmentPropertiesSchema.optional(),
});

export type FragmentCreate = z.infer<typeof FragmentCreateSchema>;
export type FragmentUpdate = z.infer<typeof FragmentUpdateSchema>;
```

Entities to cover: `fragment`, `aspect`, `note`, `reference`, `project`.

`project` is registry-layer (has `createdAt`/`updatedAt` as `Date`) — keep it in shared but note that the API serializes these as strings.

### 3. Delete `packages/shared/src/types/domain/`

Remove the old plain-type files. Update `src/types/index.ts` and `src/index.ts` to re-export from `src/schemas/domain/` instead.

All existing imports of `type { Fragment }` from `@maskor/shared` continue to work — only the source of the type changes.

### 4. Verify `@hono/zod-openapi` compatibility before wiring all entities

`@hono/zod-openapi` augments the Zod prototype to add `.openapi()`. When you call `.extend(...).openapi(...)` on a schema built from plain `zod` in shared, it relies on that prototype augmentation being in effect. This normally works but is version-sensitive.

Before converting all five entities, write a quick sanity test in `packages/api`:

```ts
import { z } from "@hono/zod-openapi";
import { FragmentSchema as DomainFragmentSchema } from "@maskor/shared";

const ApiFragmentSchema = DomainFragmentSchema.extend({ updatedAt: z.string() }).openapi(
  "Fragment",
);

// Should compile and produce a valid OpenAPI component name
console.log(ApiFragmentSchema._def.openapi?.metadata?.ref); // → "Fragment"
```

If `.openapi()` is not present on the extended schema, `@hono/zod-openapi` and `zod` versions are mismatched and need to be aligned before proceeding.

### 5. Thin out `packages/api/src/schemas/`

Each API schema file now:

- Imports the base Zod schema from `@maskor/shared`
- Wraps with `.openapi()` and `.extend()` / `.pick()` only where the API surface differs

```ts
// packages/api/src/schemas/fragment.ts
import { z } from "@hono/zod-openapi";
import {
  FragmentSchema as DomainFragmentSchema,
  FragmentCreateSchema as DomainFragmentCreateSchema,
  FragmentUpdateSchema as DomainFragmentUpdateSchema,
  FragmentPropertiesSchema,
} from "@maskor/shared";

// API response: updatedAt serialized as string, openapi annotations added
export const FragmentSchema = DomainFragmentSchema.extend({ updatedAt: z.string() }).openapi(
  "Fragment",
);

export const FragmentCreateSchema = DomainFragmentCreateSchema.openapi("FragmentCreate");
export const FragmentUpdateSchema = DomainFragmentUpdateSchema.openapi("FragmentUpdate");

// IndexedFragment — API-only shape (adds filePath from storage index)
export const IndexedFragmentSchema = DomainFragmentSchema.omit({ content: true, updatedAt: true })
  .extend({
    filePath: z.string(),
    updatedAt: z.string(),
    properties: z.record(
      z.string(),
      z.object({ weight: z.number(), aspectUuid: z.string().nullable() }),
    ),
  })
  .openapi("IndexedFragment");
```

Note: `@hono/zod-openapi` re-exports `z` with `.openapi()` added — importing from it is required for `.openapi()` to work. Importing from plain `zod` in shared is fine since shared doesn't use `.openapi()`. Verify compatibility per step 4 before converting all entities.

### 6. Update frontend form schemas where possible

No existing form can use shared schemas today. `fragmentFormSchema` in `fragment-metadata-form.tsx` uses integer percentages (0–100) and `useFieldArray` wrapping — incompatible with the domain schema's float `readyStatus` (0–1). Keep it as-is.

For future forms where the shape is a close match, prefer importing from `@maskor/shared` over redefining.

### 7. Run checks

```bash
bun run typecheck   # in root or each package
bun run test
bun run format
```

---

## What this does NOT change

- Drizzle schemas in `packages/storage/src/db/` — these are independent
- Orval codegen pipeline — API Zod schemas still produce the OpenAPI spec, Orval still generates frontend types
- The `fragmentFormSchema` in the metadata form — UI-layer shape, intentionally different

---

## Open questions

1. **UUID types** — shared currently has `type FragmentUUID = string`. These become plain `z.uuid()` inside the schema (Zod v4). The named alias is lost. Consider whether `z.uuid().brand<"FragmentUUID">()` is worth it (probably not for a learning project — adds friction).

2. **`Markdown` alias** — `content` is typed as `Markdown` (an alias for `string`) to signal intent. With Zod it becomes `z.string()`. The alias can live on as a plain type alongside the schema if desired.

3. **Re-export strategy** — decide whether `@maskor/shared` exports both `FragmentSchema` (the Zod object) and `Fragment` (the inferred type) at the top level, or only the type. Recommend exporting both — the schema is the whole point.
