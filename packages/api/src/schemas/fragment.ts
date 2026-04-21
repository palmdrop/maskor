import { z } from "@hono/zod-openapi";
import {
  FragmentSchema as DomainFragmentSchema,
  FragmentCreateSchema as DomainFragmentCreateSchema,
  FragmentUpdateSchema as DomainFragmentUpdateSchema,
  FragmentPropertiesSchema,
} from "@maskor/shared";

const IndexedFragmentPropertySchema = z.object({
  weight: z.number(),
  aspectUuid: z.string().nullable(),
});

// Response schema for GET /fragments (list) — index layer fields, no content
export const IndexedFragmentSchema = DomainFragmentSchema.omit({
  content: true,
  updatedAt: true,
})
  .extend({
    filePath: z.string(),
    updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
    properties: z.record(z.string(), IndexedFragmentPropertySchema),
  })
  .openapi("IndexedFragment");

// Response schema for GET /fragments/:id and POST /fragments — full vault fragment with content
export const FragmentSchema = DomainFragmentSchema.extend({
  uuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
  title: z.string().openapi({ example: "Harbour Lights" }),
  content: z.string().openapi({ example: "The lights flickered at dusk..." }),
  updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
}).openapi("Fragment");

export const FragmentCreateSchema = DomainFragmentCreateSchema.extend({
  title: z.string().min(1).openapi({ example: "Harbour Lights" }),
  content: z.string().min(1).openapi({ example: "The lights flickered at dusk..." }),
}).openapi("FragmentCreate");

export const FragmentUpdateSchema = DomainFragmentUpdateSchema.extend({
  title: z.string().min(1).optional().openapi({ example: "Harbour Lights" }),
  content: z.string().optional().openapi({ example: "The lights flickered at dusk..." }),
  properties: FragmentPropertiesSchema.optional(),
}).openapi("FragmentUpdate");

export const FragmentUUIDParamSchema = z.object({
  projectId: z.uuid(),
  fragmentId: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});
