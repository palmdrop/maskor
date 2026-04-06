import { z } from "@hono/zod-openapi";

const SyncWarningSchema = z.object({
  kind: z.literal("UNKNOWN_ASPECT_KEY"),
  aspectKey: z.string(),
  fragmentUuids: z.array(z.string().uuid()),
});

export const RebuildStatsSchema = z
  .object({
    fragments: z.number().int(),
    aspects: z.number().int(),
    notes: z.number().int(),
    references: z.number().int(),
    durationMs: z.number(),
    warnings: z.array(SyncWarningSchema),
  })
  .openapi("RebuildStats");
