import { z } from "@hono/zod-openapi";

const HeadingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

// The structural delimiter the splitter cuts on. Maps 1:1 onto the importer's
// `SplitDelimiter` discriminated union (heading level / thematic break /
// blank-line), so it is passed straight to `splitByDelimiter`.
export const SplitDelimiterSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("heading"), level: HeadingLevelSchema }),
    z.object({ type: z.literal("thematic-break") }),
    z.object({ type: z.literal("blank-line") }),
  ])
  .openapi("SplitDelimiter");

export type SplitDelimiterInput = z.infer<typeof SplitDelimiterSchema>;

export const SplitPreviewBodySchema = z
  .object({
    fragmentId: z.string().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    delimiter: SplitDelimiterSchema,
  })
  .openapi("SplitPreviewBody");

const SplitPiecePreviewSchema = z
  .object({
    pieceIndex: z.number().int().openapi({ example: 1 }),
    key: z.string().openapi({ example: "my-fragment" }),
    excerpt: z.string().openapi({ example: "The opening line of the piece…" }),
  })
  .openapi("SplitPiecePreview");

export const SplitPreviewResultSchema = z
  .object({
    pieces: z.array(SplitPiecePreviewSchema),
    count: z.number().int().openapi({ example: 3 }),
  })
  .openapi("SplitPreviewResult");

export const SplitBodySchema = z
  .object({
    fragmentId: z.string().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    delimiter: SplitDelimiterSchema,
  })
  .openapi("SplitBody");

export const SplitResultSchema = z
  .object({
    sourceFragmentUuid: z
      .string()
      .openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    createdCount: z.number().int().openapi({ example: 2 }),
    createdUuids: z
      .array(z.string())
      .openapi({ example: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"] }),
  })
  .openapi("SplitResult");
