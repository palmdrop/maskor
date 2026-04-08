import { z } from "@hono/zod-openapi";

export const PoolSchema = z.enum(["unprocessed", "incomplete", "unplaced", "discarded"]);

const IndexedFragmentPropertySchema = z.object({
  weight: z.number(),
  aspectUuid: z.string().nullable(),
});

const FragmentPropertySchema = z.object({
  weight: z.number(),
});

// Response schema for GET /fragments (list) — index layer fields, no content body
export const IndexedFragmentSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    title: z.string().openapi({ example: "Harbour Lights" }),
    version: z.number().int(),
    pool: PoolSchema,
    readyStatus: z.number().min(0).max(1),
    contentHash: z.string(),
    filePath: z.string(),
    notes: z.array(z.string()),
    references: z.array(z.string()),
    properties: z.record(z.string(), IndexedFragmentPropertySchema),
  })
  .openapi("IndexedFragment");

// Response schema for GET /fragments/:id and POST /fragments — full vault fragment with content
export const FragmentSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    title: z.string().openapi({ example: "Harbour Lights" }),
    version: z.number().int(),
    pool: PoolSchema,
    readyStatus: z.number().min(0).max(1),
    contentHash: z.string(),
    notes: z.array(z.string()),
    references: z.array(z.string()),
    properties: z.record(z.string(), FragmentPropertySchema),
    content: z.string().openapi({ example: "The lights flickered at dusk..." }),
    updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
  })
  .openapi("Fragment");

export const FragmentCreateSchema = z
  .object({
    title: z.string().min(1).openapi({ example: "Harbour Lights" }),
    content: z.string().min(1).openapi({ example: "The lights flickered at dusk..." }),
    pool: PoolSchema.openapi({ example: "unplaced" }),
  })
  .openapi("FragmentCreate");

export const FragmentUUIDParamSchema = z.object({
  projectId: z.uuid(),
  fragmentId: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});

export const FragmentPoolQuerySchema = z.object({
  pool: PoolSchema.optional(),
});
