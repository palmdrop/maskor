import { z } from "@hono/zod-openapi";

// List response — index layer fields
export const IndexedReferenceSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "The Old Man and the Sea" }),
    filePath: z.string(),
  })
  .openapi("IndexedReference");

// Single-get response — vault type with content
export const ReferenceSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "The Old Man and the Sea" }),
    content: z.string(),
  })
  .openapi("Reference");

export const ReferenceUUIDParamSchema = z.object({
  projectId: z.uuid(),
  referenceId: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});

export const ReferenceCreateSchema = z
  .object({
    name: z.string().min(1).openapi({ example: "The Old Man and the Sea" }),
    content: z.string().openapi({ example: "Hemingway. Santiago. Marlin." }),
  })
  .openapi("ReferenceCreate");
