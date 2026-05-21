import { z } from "@hono/zod-openapi";

export const projectIdParamSchema = z.object({ projectId: z.uuid() });

export const InsertionBodySchema = z.object({
  insertedBody: z.string().min(1).openapi({ example: "The lights flickered at dusk..." }),
  sourceUuid: z.uuid().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
  sourceType: z.enum(["fragment", "note", "reference", "aspect"]).openapi({ example: "fragment" }),
  sourceMode: z.enum(["keep", "cut"]).openapi({ example: "keep" }),
  navigated: z.boolean().openapi({ example: true }),
});
