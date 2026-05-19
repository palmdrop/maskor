import { z } from "@hono/zod-openapi";
import { SWAP_ENTITY_TYPES } from "@maskor/storage";

export const SwapEntityTypeSchema = z.enum(SWAP_ENTITY_TYPES).openapi({
  example: "fragment",
});

export const SwapParamSchema = z.object({
  projectId: z.uuid(),
  entityType: SwapEntityTypeSchema,
  entityUUID: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

export const SwapWriteBodySchema = z
  .object({
    content: z.string().openapi({ example: "draft content the user is typing" }),
  })
  .openapi("SwapWriteBody");

export const SwapWriteResponseSchema = z
  .object({
    savedAt: z.string().openapi({ example: "2026-05-19T10:00:00.000Z" }),
  })
  .openapi("SwapWriteResponse");

// Read response always returns 200. `content` and `savedAt` are null when no swap
// file exists for the entity — keeps the network panel clean and avoids the
// "looks like an error" 404 on every mount.
export const SwapReadResponseSchema = z
  .object({
    content: z.string().nullable(),
    savedAt: z.string().nullable(),
  })
  .openapi("SwapReadResponse");
