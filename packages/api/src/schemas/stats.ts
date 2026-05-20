import { z } from "@hono/zod-openapi";

export const FragmentStatsSchema = z
  .object({
    fragmentUuid: z.string().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    wordCount: z.number().int().openapi({ example: 120 }),
    editCount: z.number().int().openapi({ example: 5 }),
    voluntaryOpenCount: z.number().int().openapi({ example: 3 }),
    promptAcceptCount: z.number().int().openapi({ example: 2 }),
    avoidanceCount: z.number().int().openapi({ example: 1 }),
    lastSurfacedAt: z.string().nullable().openapi({ example: "2026-01-01T00:00:00.000Z" }),
  })
  .openapi("FragmentStats");

export const FragmentStatsSummarySchema = z
  .object({
    fragmentUuid: z.string().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "my-fragment" }),
    wordCount: z.number().int().openapi({ example: 120 }),
    updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
    readiness: z.number().openapi({ example: 0.75 }),
    isDiscarded: z.boolean().openapi({ example: false }),
  })
  .openapi("FragmentStatsSummary");

export const ProjectStatsSchema = z
  .object({
    global: z.object({
      totalCount: z.number().int().openapi({ example: 42 }),
      discardedCount: z.number().int().openapi({ example: 5 }),
      readyCount: z.number().int().openapi({ example: 10 }),
      averageReadiness: z.number().openapi({ example: 0.65 }),
      readinessHistogram: z
        .tuple([
          z.number().int(),
          z.number().int(),
          z.number().int(),
          z.number().int(),
          z.number().int(),
        ])
        .openapi({ example: [10, 8, 12, 7, 5] }),
      totalWordCount: z.number().int().openapi({ example: 5040 }),
      averageWordCount: z.number().openapi({ example: 120 }),
    }),
    fragments: z.array(FragmentStatsSummarySchema),
  })
  .openapi("ProjectStats");
