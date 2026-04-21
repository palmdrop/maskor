# Review: Zod-First Shared Schemas Refactor

**Date**: 2026-04-21

---

## Summary

The refactor achieves its primary goal: Zod schemas are the single source of truth in `@maskor/shared`, the API layer imports and extends them correctly, and the Orval codegen pipeline is unaffected. The structural shape of the change is sound and plan-aligned. However, there are several concrete issues: a domain field missing from `ProjectSchema`, an incomplete schema in `AspectCreateSchema` (no update schema at all), redundant field re-definition in `FragmentUpdateSchema`, and a silent discrepancy between the plan example for `IndexedFragmentSchema` and the actual implementation. None are blockers today, but several will cause pain when routes are exercised against real data.

---

## Issues

### [CRITICAL] `ProjectSchema` in shared is missing `createdAt` and `updatedAt`

**File**: `packages/shared/src/schemas/domain/project.ts`

The domain `ProjectSchema` has no `createdAt` or `updatedAt` fields. The plan explicitly calls out that `project` "has `createdAt`/`updatedAt` as `Date`" at the domain level, and that "the API serializes these as strings." The API `ProjectSchema` defines them as `z.string()` directly on a bare `z.object({...})` rather than extending the domain schema — meaning the API's `ProjectSchema` has zero relationship to the shared `ProjectSchema`. The whole point of the refactor is broken for this entity.

```ts
// packages/api/src/schemas/project.ts
// Only DomainProjectCreateSchema is imported — DomainProjectSchema is never used
import { ProjectCreateSchema as DomainProjectCreateSchema } from "@maskor/shared";
```

The domain schema should have `createdAt: z.date()` and `updatedAt: z.date()`. The API schema should then do `DomainProjectSchema.extend({ createdAt: z.string(), updatedAt: z.string() }).openapi("Project")`, parallel to how `Fragment` is handled.

---

### [CRITICAL] `FragmentUpdateSchema` in API layer re-defines `properties` inline, diverging from `FragmentPropertiesSchema`

**File**: `packages/api/src/schemas/fragment.ts`, line 40

```ts
export const FragmentUpdateSchema = DomainFragmentUpdateSchema.extend({
  ...
  properties: z.record(z.string(), z.object({ weight: z.number() })).optional(),
}).openapi("FragmentUpdate");
```

This silently strips out the `aspectUuid` enrichment that exists on `IndexedFragmentPropertySchema`. More importantly, it duplicates the properties shape inline instead of importing `FragmentPropertiesSchema` from shared. If the domain property shape changes, the update schema won't follow.

The plan explicitly imports `FragmentPropertiesSchema` in the API layer example for `IndexedFragmentSchema`. The same should apply here. Fix: import and reuse `FragmentPropertiesSchema` from `@maskor/shared`.

---

### [WARNING] `IndexedFragmentSchema` drops `updatedAt` without comment — contradicts the plan's example

**File**: `packages/api/src/schemas/fragment.ts`, lines 14–22

The plan's step 5 example shows `updatedAt: z.string()` being added back into `IndexedFragmentSchema` after omitting it from the domain schema. The implementation omits it and does not add it back.

This is actually consistent with `packages/storage/src/indexer/types.ts` — `IndexedFragment` in storage has no `updatedAt`. So the implementation may be intentionally correct. But the deviation from the plan example is silent and could confuse anyone reading the plan alongside the code.

If this is intentional (the index doesn't track `updatedAt`), add a comment:

```ts
// Response schema for GET /fragments — index layer fields only.
// updatedAt is intentionally absent: the vault index does not track modification time.
export const IndexedFragmentSchema = DomainFragmentSchema.omit({
  content: true,
  updatedAt: true,
})
```

---

### [WARNING] `Aspect` has no `UpdateSchema` in shared or API layer

**Files**: `packages/shared/src/schemas/domain/aspect.ts`, `packages/api/src/schemas/aspect.ts`

`Fragment` has `FragmentUpdateSchema`. `Aspect` has only `AspectCreateSchema`. If a PATCH route for aspects exists or is planned, the update schema is missing from both shared and the API layer. Check whether a PATCH `/aspects/:id` route is intended — if so, add the schema now rather than at the point of implementing the route.

Same applies to `Note`, `Reference`, and `Project` — none have update schemas in shared. This may be intentional if those entities are immutable once created, but it's worth confirming. At minimum, `Aspect` seems like it should be editable.

---

### [WARNING] UUID alias types retained as plain `string` outside the schema files — inconsistent signaling

**Files**: `packages/shared/src/schemas/domain/fragment.ts` line 3, `aspect.ts` line 3, `note.ts` line 3, `reference.ts` line 3, `project.ts` line 3

```ts
export type FragmentUUID = string;
export type ReadyStatus = number;
```

These are plain `type` aliases, not branded types or Zod schemas. The plan acknowledges this under open question 1 and accepts it for a learning project. That's fine. But `ReadyStatus = number` lives alongside `FragmentUUID = string` with no explanation — it signals intent but provides no enforcement. Neither is derived via `z.infer<>`, which is inconsistent with the rest of the file. If these are kept, they should at minimum have a comment explaining why they aren't derived from the schema.

The plan's open question 1 noted: "The named alias is lost" — but these aliases are still manually declared. If the intent is to keep them as documentation-only aliases, that's acceptable, but make it explicit.

---

### [WARNING] `AspectCreateSchema` in API layer adds `.default([])` to `notes`, silently changing create semantics

**File**: `packages/api/src/schemas/aspect.ts`, line 32

```ts
export const AspectCreateSchema = DomainAspectCreateSchema.extend({
  key: z.string().min(1).openapi({ example: "tone" }),
  category: z.string().optional().openapi({ example: "style" }),
  notes: z.array(z.string()).default([]),
}).openapi("AspectCreate");
```

The domain `AspectCreateSchema` requires `notes: z.array(z.string())` (non-optional, no default). The API layer silently makes it optional by adding `.default([])`. This means a client can omit `notes` and it will be coerced to `[]`, but the domain schema would reject the same input. The API and domain schemas are now semantically inconsistent for this field.

If `notes` should always be optional on create, update the domain schema. If it's required, remove `.default([])` from the API schema.

---

### [STYLE] `AspectCreateSchema` in shared includes `description` in create payload — inconsistent with other entities

**File**: `packages/shared/src/schemas/domain/aspect.ts`, lines 15–21

`AspectCreateSchema` includes `description?: z.string().optional()` but the plan example for `FragmentCreateSchema` only includes the minimal fields needed to create. Notes and description on create is a design choice, but it's inconsistent: `NoteCreateSchema` and `ReferenceCreateSchema` use only the minimal fields. Not a bug, but worth making deliberate.

---

### [STYLE] Shared schemas path is `src/schemas/domain/` but plan specified `src/schemas/domain/`

No violation here — the actual layout matches the plan's architecture diagram exactly. Noted as confirmed-correct.

---

### [STYLE] `FragmentSchema` in API layer adds individual `.openapi()` calls on fields that weren't in the domain schema's extend call

**File**: `packages/api/src/schemas/fragment.ts`, lines 25–30

```ts
export const FragmentSchema = DomainFragmentSchema.extend({
  uuid: z.uuid().openapi({ example: "..." }),
  title: z.string().openapi({ example: "Harbour Lights" }),
  content: z.string().openapi({ example: "The lights flickered..." }),
  updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
}).openapi("Fragment");
```

`uuid`, `title`, and `content` are not being changed — they're re-declared only to attach `.openapi()` examples. This is the correct pattern for `@hono/zod-openapi` and is not a violation, but it's worth knowing: each re-declared field overrides the full field definition from the base schema, including any validations. If `DomainFragmentSchema` adds `uuid: z.uuid().min(...)` in future (hypothetically), the API override silently drops it. This is a low-risk known tradeoff of the `.extend()` pattern.

---

## Architecture Notes

**What was done well:**

- The import aliasing convention (`FragmentSchema as DomainFragmentSchema`) is clean and avoids naming collisions throughout.
- The decision to NOT re-export from `src/types/domain/` for the five migrated entities — and instead export from `src/schemas/domain/` — is correct. The `types/domain/index.ts` now only re-exports the remaining non-schema types (`arc`, `action`, `sequence`, `piece`, `user`, `interleaving`), which still import UUID types from the new schema files. This cross-import is fine.
- `z.uuid()` and `z.int()` are used correctly (Zod v4 syntax, not `z.string().uuid()` or `z.number().int()`).
- API date serialization is handled correctly for `Fragment` (domain `z.date()` → API `z.string()`). The Orval-generated `Fragment` type has `updatedAt: string`, which is correct.
- `FragmentPropertiesSchema` is correctly extracted as a named sub-schema and reused in `IndexedFragmentSchema` (though not in `FragmentUpdateSchema` — see critical issue above).
- The generated Orval types in `maskorAPI.schemas.ts` look correct and reflect the API schemas as expected: `Fragment.updatedAt` is `string`, `IndexedFragment` has `filePath` and `aspectUuid | null` in properties, `Project` has `projectUUID` (not `uuid`).

**Structural concern — `ProjectSchema` architectural split:**

`Project` is the only entity where the API response shape is structurally different from the domain: it uses `projectUUID` instead of `uuid`, adds `userUUID`, and the domain schema has none of the registry fields (`createdAt`, `updatedAt`). The plan acknowledges this as an intentional deviation ("API response shape diverges from domain"). Because of this, `DomainProjectSchema` cannot be a base for the API `ProjectSchema` without a rename operation.

One clean option: keep the API `ProjectSchema` as a standalone `z.object({...})` (current approach) and document it explicitly as "API-only, no domain base." That's actually defensible. The current code does this but without the comment, making it look like an oversight rather than a decision.

---

## Questions

1. **`IndexedFragmentSchema` dropping `updatedAt`** — is this intentional (the index doesn't store it) or an oversight from not following the plan's example? Confirm against `IndexedFragment` in storage (which also lacks `updatedAt`), which suggests intentional. But the plan example says to add it back as `z.string()`. Needs explicit confirmation.

2. **Update schemas for `Aspect`, `Note`, `Reference`** — are PATCH routes planned for any of these? If yes, the update schemas should be added to shared now while the pattern is being established.

3. **`ProjectSchema` domain/API split** — should `ProjectSchema` in shared include `createdAt`/`updatedAt` as `z.date()`, even if the API layer constructs its response schema independently? The plan says yes; the implementation says no. This is the most significant deviation.
