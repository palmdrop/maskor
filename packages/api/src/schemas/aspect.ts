import { z } from "@hono/zod-openapi";

// List response — index layer fields
export const IndexedAspectSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "tone" }),
    category: z.string().optional().openapi({ example: "style" }),
    filePath: z.string(),
    notes: z.array(z.string()),
  })
  .openapi("IndexedAspect");

// Single-get response — vault type with description
export const AspectSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "tone" }),
    category: z.string().optional().openapi({ example: "style" }),
    description: z.string().optional(),
    notes: z.array(z.string()),
  })
  .openapi("Aspect");

export const AspectUUIDParamSchema = z.object({
  projectId: z.uuid(),
  aspectId: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});
