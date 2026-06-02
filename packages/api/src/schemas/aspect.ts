import { z } from "@hono/zod-openapi";
import {
  AspectSchema as DomainAspectSchema,
  AspectCreateSchema as DomainAspectCreateSchema,
  AspectUpdateSchema as DomainAspectUpdateSchema,
  AspectColorSchema,
} from "@maskor/shared";
import { InsertionBodySchema } from "./shared";

const ColorExample = { example: "#f97316" };

// List response — index layer fields
export const IndexedAspectSchema = DomainAspectSchema.omit({
  description: true,
  extraFrontmatter: true,
})
  .extend({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "tone" }),
    category: z.string().optional().openapi({ example: "style" }),
    color: AspectColorSchema.optional().openapi(ColorExample),
    filePath: z.string(),
  })
  .openapi("IndexedAspect");

// Single-get response — vault type with description
export const AspectSchema = DomainAspectSchema.omit({ extraFrontmatter: true })
  .extend({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "tone" }),
    category: z.string().optional().openapi({ example: "style" }),
    color: z.string().optional().openapi(ColorExample),
  })
  .openapi("Aspect");

export const AspectUUIDParamSchema = z.object({
  projectId: z.uuid(),
  aspectId: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

export const AspectCreateSchema = DomainAspectCreateSchema.extend({
  key: z.string().min(1).openapi({ example: "tone" }),
  color: z.string().optional().openapi(ColorExample),
  notes: z.array(z.string()).default([]),
}).openapi("AspectCreate");

export const AspectUpdateSchema = DomainAspectUpdateSchema.extend({
  key: z.string().min(1).optional().openapi({ example: "tone" }),
  category: z.string().nullable().optional().openapi({ example: "style" }),
  color: AspectColorSchema.nullable().optional().openapi(ColorExample),
}).openapi("AspectUpdate");

export const AspectUpdateResponseSchema = z
  .object({
    aspect: AspectSchema,
    warnings: z.array(z.string()),
  })
  .openapi("AspectUpdateResponse");

export const AspectExtractSchema = z
  .object({
    key: z.string().min(1).openapi({ example: "tone" }),
    description: z.string().min(1).openapi({ example: "Melancholic undertone throughout..." }),
    sourceUuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    sourceType: z
      .enum(["fragment", "note", "reference", "aspect"])
      .openapi({ example: "fragment" }),
    sourceMode: z.enum(["keep"]).openapi({ example: "keep" }),
    navigated: z.boolean().openapi({ example: true }),
  })
  .openapi("AspectExtract");

export const AspectInsertionSchema = InsertionBodySchema.openapi("AspectInsertion");

export const AspectInsertionResponseSchema = z
  .object({
    aspect: AspectSchema,
    sourceCutFailed: z.boolean().openapi({ example: false }),
  })
  .openapi("AspectInsertionResponse");
