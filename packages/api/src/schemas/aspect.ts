import { z } from "@hono/zod-openapi";
import {
  AspectSchema as DomainAspectSchema,
  AspectCreateSchema as DomainAspectCreateSchema,
  AspectUpdateSchema as DomainAspectUpdateSchema,
} from "@maskor/shared";

// List response — index layer fields
export const IndexedAspectSchema = DomainAspectSchema.omit({ description: true })
  .extend({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "tone" }),
    category: z.string().optional().openapi({ example: "style" }),
    filePath: z.string(),
  })
  .openapi("IndexedAspect");

// Single-get response — vault type with description
export const AspectSchema = DomainAspectSchema.extend({
  uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  key: z.string().openapi({ example: "tone" }),
  category: z.string().optional().openapi({ example: "style" }),
}).openapi("Aspect");

export const AspectUUIDParamSchema = z.object({
  projectId: z.uuid(),
  aspectId: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

export const AspectCreateSchema = DomainAspectCreateSchema.extend({
  key: z.string().min(1).openapi({ example: "tone" }),
  category: z.string().optional().openapi({ example: "style" }),
  notes: z.array(z.string()).default([]),
}).openapi("AspectCreate");

export const AspectUpdateSchema = DomainAspectUpdateSchema.extend({
  key: z.string().min(1).optional().openapi({ example: "tone" }),
  category: z.string().optional().openapi({ example: "style" }),
}).openapi("AspectUpdate");
