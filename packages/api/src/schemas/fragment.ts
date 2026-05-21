import { z } from "@hono/zod-openapi";
import {
  FragmentSchema as DomainFragmentSchema,
  FragmentCreateSchema as DomainFragmentCreateSchema,
  FragmentUpdateSchema as DomainFragmentUpdateSchema,
  AspectWeightsSchema,
} from "@maskor/shared";

const IndexedFragmentAspectSchema = z.object({
  weight: z.number(),
});

// Response schema for GET /fragments (list) — index layer fields, no content
export const IndexedFragmentSchema = DomainFragmentSchema.omit({
  content: true,
  updatedAt: true,
})
  .extend({
    key: z.string().openapi({ example: "harbour-lights" }),
    filePath: z.string(),
    updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
    aspects: z.record(z.string(), IndexedFragmentAspectSchema),
  })
  .openapi("IndexedFragment");

// Response schema for GET /fragments/:id and POST /fragments — full vault fragment with content.
// updatedAt is omitted from the domain schema so it can be re-typed as a string (ISO date) for
// JSON transport; other fields are re-extended only to attach OpenAPI examples.
export const FragmentSchema = DomainFragmentSchema.omit({ updatedAt: true })
  .extend({
    uuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "harbour-lights" }),
    content: z.string().openapi({ example: "The lights flickered at dusk..." }),
    updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
  })
  .openapi("Fragment");

export const FragmentCreateSchema = DomainFragmentCreateSchema.extend({
  key: z.string().min(1).openapi({ example: "harbour-lights" }),
  content: z.string().min(1).openapi({ example: "The lights flickered at dusk..." }),
}).openapi("FragmentCreate");

export const FragmentUpdateSchema = DomainFragmentUpdateSchema.extend({
  key: z.string().min(1).optional().openapi({ example: "harbour-lights" }),
  content: z.string().optional().openapi({ example: "The lights flickered at dusk..." }),
  aspects: AspectWeightsSchema.optional(),
}).openapi("FragmentUpdate");

export const FragmentUpdateResponseSchema = z
  .object({
    fragment: FragmentSchema,
    warnings: z.array(z.string()),
  })
  .openapi("FragmentUpdateResponse");

export const FragmentSummarySchema = z
  .object({
    uuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "harbour-lights" }),
    isDiscarded: z.boolean(),
    excerpt: z.string().nullable().openapi({ example: "The lights flickered at dusk…" }),
    aspects: z.record(z.string(), IndexedFragmentAspectSchema),
  })
  .openapi("FragmentSummary");

export const FragmentUUIDParamSchema = z.object({
  projectId: z.uuid(),
  fragmentId: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});

export const FragmentExtractSchema = z
  .object({
    key: z.string().min(1).openapi({ example: "harbour-lights" }),
    content: z.string().min(1).openapi({ example: "The lights flickered at dusk..." }),
    sourceUuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    sourceType: z
      .enum(["fragment", "note", "reference", "aspect"])
      .openapi({ example: "fragment" }),
    sourceMode: z.enum(["keep"]).openapi({ example: "keep" }),
    navigated: z.boolean().openapi({ example: true }),
  })
  .openapi("FragmentExtract");
