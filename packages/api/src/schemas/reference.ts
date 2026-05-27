import { z } from "@hono/zod-openapi";
import {
  ReferenceSchema as DomainReferenceSchema,
  ReferenceCreateSchema as DomainReferenceCreateSchema,
  ReferenceUpdateSchema as DomainReferenceUpdateSchema,
  ReferenceUpdateResponseSchema as DomainReferenceUpdateResponseSchema,
} from "@maskor/shared";
import { InsertionBodySchema } from "./shared";

// List response — index layer fields
export const IndexedReferenceSchema = DomainReferenceSchema.pick({ uuid: true, key: true })
  .extend({
    uuid: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "The Old Man and the Sea" }),
    category: z.string().optional().openapi({ example: "novels" }),
    filePath: z.string(),
  })
  .openapi("IndexedReference");

// Single-get response — vault type with content
export const ReferenceSchema = DomainReferenceSchema.extend({
  uuid: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
  key: z.string().openapi({ example: "The Old Man and the Sea" }),
  category: z.string().optional().openapi({ example: "novels" }),
}).openapi("Reference");

export const ReferenceUUIDParamSchema = z.object({
  projectId: z.uuid(),
  referenceId: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});

export const ReferenceCreateSchema = DomainReferenceCreateSchema.extend({
  key: z.string().min(1).openapi({ example: "The Old Man and the Sea" }),
  content: z.string().openapi({ example: "Hemingway. Santiago. Marlin." }),
}).openapi("ReferenceCreate");

export const ReferenceUpdateSchema = DomainReferenceUpdateSchema.extend({
  key: z.string().min(1).optional().openapi({ example: "The Old Man and the Sea" }),
  category: z.string().nullable().optional().openapi({ example: "novels" }),
  content: z.string().optional().openapi({ example: "Hemingway. Santiago. Marlin." }),
}).openapi("ReferenceUpdate");

export const ReferenceUpdateResponseSchema = DomainReferenceUpdateResponseSchema.extend({
  reference: ReferenceSchema,
}).openapi("ReferenceUpdateResponse");

export const ReferenceExtractSchema = z
  .object({
    key: z.string().min(1).openapi({ example: "The Old Man and the Sea" }),
    content: z.string().min(1).openapi({ example: "Hemingway. Santiago. Marlin." }),
    sourceUuid: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    sourceType: z
      .enum(["fragment", "note", "reference", "aspect"])
      .openapi({ example: "fragment" }),
    sourceMode: z.enum(["keep"]).openapi({ example: "keep" }),
    navigated: z.boolean().openapi({ example: true }),
  })
  .openapi("ReferenceExtract");

export const ReferenceInsertionSchema = InsertionBodySchema.openapi("ReferenceInsertion");

export const ReferenceInsertionResponseSchema = z
  .object({
    reference: ReferenceSchema,
    sourceCutFailed: z.boolean().openapi({ example: false }),
  })
  .openapi("ReferenceInsertionResponse");
