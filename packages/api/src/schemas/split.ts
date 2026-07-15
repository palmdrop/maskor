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
    // Optional: when omitted, the server picks a smart default delimiter for the
    // fragment's content (shallowest splitting heading level → thematic break;
    // never blank-line) and reports it back as `appliedDelimiter`.
    delimiter: SplitDelimiterSchema.optional(),
    // When false (the default), a heading that starts a piece is stripped from its
    // body and becomes the piece's key (including piece 1 → the original is
    // renamed). When true, headings stay in the body. Only affects heading splits.
    keepHeadingInBody: z.boolean().optional().openapi({ example: false }),
  })
  .openapi("SplitPreviewBody");

const SplitPiecePreviewSchema = z
  .object({
    pieceIndex: z.number().int().openapi({ example: 1 }),
    key: z.string().openapi({ example: "my-fragment" }),
    excerpt: z.string().openapi({ example: "The opening line of the piece…" }),
    // Present (true) only for piece 1 when the original will be renamed to its
    // heading-derived key because the heading is stripped from the body.
    renamedOriginal: z.boolean().optional().openapi({ example: true }),
  })
  .openapi("SplitPiecePreview");

export const SplitPreviewResultSchema = z
  .object({
    pieces: z.array(SplitPiecePreviewSchema),
    count: z.number().int().openapi({ example: 3 }),
    // The delimiter the preview was computed with — echoes the request delimiter,
    // or the smart-detected default when the request omitted one. Lets the dialog
    // seed its delimiter controls to match the auto-selected split.
    appliedDelimiter: SplitDelimiterSchema,
  })
  .openapi("SplitPreviewResult");

// A user-chosen key for one of the pieces (1-based pieceIndex, as in the
// preview). An override for piece 1 renames the original fragment (the storage
// service cascades the file + Margin rename and rewrites links); it takes
// precedence over the automatic rename to a stripped heading.
const SplitPieceKeySchema = z
  .object({
    pieceIndex: z.number().int().min(1).openapi({ example: 2 }),
    key: z.string().min(1).openapi({ example: "renamed-piece" }),
  })
  .openapi("SplitPieceKey");

export const SplitBodySchema = z
  .object({
    fragmentId: z.string().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    delimiter: SplitDelimiterSchema,
    // Optional per-piece key overrides. A new piece without an override falls back
    // to its derived key; piece 1 without an override keeps the original's key
    // (renamed automatically to its heading when the heading is stripped). An
    // override for piece 1 renames the original explicitly.
    pieceKeys: z.array(SplitPieceKeySchema).optional(),
    // When false (the default), a heading that starts a piece is stripped from its
    // body and becomes the piece's key (including piece 1 → the original is renamed
    // to its leading heading). When true, headings stay in the body and the original
    // keeps its key. Only affects heading splits.
    keepHeadingInBody: z.boolean().optional().openapi({ example: false }),
    // Optional opt-in: also create a new secondary sequence holding all resulting
    // pieces in split order (piece 1 = the original, then pieces 2…N). Omitted →
    // no sequence is created.
    intoSequence: z
      .object({ name: z.string().min(1).openapi({ example: "my-fragment split" }) })
      .optional()
      .openapi("SplitIntoSequence"),
  })
  .openapi("SplitBody");

export const SplitResultSchema = z
  .object({
    sourceFragmentUuid: z.string().openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    createdCount: z.number().int().openapi({ example: 2 }),
    createdUuids: z
      .array(z.string())
      .openapi({ example: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"] }),
    // Non-fatal follow-up failures (sequence placement, Margin migration) after
    // the split's core writes committed. The split succeeded — the frontend
    // surfaces these as a warning toast, not a failure. Empty on a clean split.
    warnings: z.array(z.string()).openapi({
      example: ['The new pieces could not be inserted into sequence "Main". Place them manually.'],
    }),
    // Present when `intoSequence` was requested and the sequence write succeeded.
    // Absent when not requested, or when the write failed (surfaced via `warnings`).
    createdSequenceUuid: z
      .string()
      .optional()
      .openapi({ example: "b2c3d4e5-f6a7-8901-bcde-f12345678901" }),
    createdSequenceName: z.string().optional().openapi({ example: "my-fragment split" }),
    // Present when the original was renamed — to its leading heading (heading
    // stripped from the body) or to a user-chosen piece-1 key override.
    originalKeyRenamedTo: z.string().optional().openapi({ example: "chapter-1" }),
  })
  .openapi("SplitResult");
