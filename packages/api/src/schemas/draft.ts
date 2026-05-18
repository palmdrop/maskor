import { z } from "@hono/zod-openapi";

export const DraftEntityCountsSchema = z
  .object({
    fragments: z.number().int().min(0),
    aspects: z.number().int().min(0),
    notes: z.number().int().min(0),
    references: z.number().int().min(0),
    sequences: z.number().int().min(0),
  })
  .openapi("DraftEntityCounts");

export const DraftSchema = z
  .object({
    uuid: z.string().openapi({ example: "11111111-1111-1111-1111-111111111111" }),
    name: z.string().min(1).openapi({ example: "Draft 1" }),
    note: z.string().optional().openapi({ example: "Before the rewrite" }),
    createdAt: z.string().openapi({ example: "2026-05-18T12:00:00.000Z" }),
    entityCounts: DraftEntityCountsSchema,
  })
  .openapi("Draft");

export const DraftCreateBodySchema = z
  .object({
    name: z.string().min(1).openapi({ example: "Draft 1" }),
    note: z.string().optional().openapi({ example: "after first chapter" }),
  })
  .openapi("DraftCreateBody");

export const DraftRestoreBodySchema = z
  .object({
    saveCurrentFirst: z.boolean().openapi({ example: true }),
    preRestoreName: z.string().optional(),
  })
  .openapi("DraftRestoreBody");

export const DraftRestoreResponseSchema = z
  .object({
    restoredDraftUuid: z.string(),
    preRestoreDraftUuid: z.string().optional(),
  })
  .openapi("DraftRestoreResponse");

export const DraftUUIDParamSchema = z.object({
  projectId: z.uuid(),
  draftId: z.string(),
});
