import { z } from "@hono/zod-openapi";
import { LINK_TARGET_TYPES, LINK_SOURCE_TYPES } from "@maskor/shared";

// Query params for the backlinks endpoint: the entity whose inbound links are requested.
export const BacklinksQuerySchema = z.object({
  targetType: z.enum(LINK_TARGET_TYPES).openapi({ example: "note" }),
  targetKey: z.string().min(1).openapi({ example: "setting-notes" }),
});

export const BacklinkResponseSchema = z
  .object({
    sourceType: z.enum(LINK_SOURCE_TYPES),
    sourceUuid: z.string(),
    sourceKey: z.string(),
    alias: z.string().nullable(),
    snippet: z.string().nullable(),
  })
  .openapi("Backlink");

export const BacklinkListSchema = z.array(BacklinkResponseSchema);
