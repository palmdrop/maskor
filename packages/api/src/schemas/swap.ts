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
    // Fingerprint of the server content the buffered edits diverged from. Lets recovery distinguish a
    // single-tab crash (baseline still matches the current server) from a stale multi-tab overwrite
    // (the server advanced elsewhere). Optional so legacy clients keep working. (multi-tab-swap-hardening)
    baseHash: z.string().optional().openapi({ example: "a1b2c3d4" }),
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
    // The baseline fingerprint recorded on the last write, or null when absent (no swap, or a legacy
    // swap written before baselines existed). Recovery compares it to the current server content.
    baseHash: z.string().nullable(),
  })
  .openapi("SwapReadResponse");

export const SwapListEntrySchema = z
  .object({
    entityType: SwapEntityTypeSchema,
    entityUUID: z.uuid(),
    savedAt: z.string().openapi({ example: "2026-05-19T10:00:00.000Z" }),
  })
  .openapi("SwapListEntry");

// Lists every entity that currently has an unsaved-content swap file. Used to
// surface an "unsaved changes" indicator in entity lists without reading each
// entity's swap individually. A swap entry is present iff the entity had unsaved
// edits at the last debounce and they have not since been saved (which clears it).
export const SwapListResponseSchema = z
  .object({
    entries: z.array(SwapListEntrySchema),
  })
  .openapi("SwapListResponse");
