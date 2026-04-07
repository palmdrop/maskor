import { z } from "@hono/zod-openapi";

export const ReferenceSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "The Old Man and the Sea" }),
    filePath: z.string(),
  })
  .openapi("Reference");

export const ReferenceUUIDParamSchema = z.object({
  projectId: z.uuid(),
  referenceId: z.uuid().openapi({ example: "r1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});
