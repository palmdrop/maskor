import { z } from "@hono/zod-openapi";

const HeadingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const ImportOptionsSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("markdown"), headingLevel: HeadingLevelSchema }),
  z.object({ format: z.literal("docx"), headingLevel: HeadingLevelSchema }),
  z.object({ format: z.literal("plaintext"), delimiter: z.string().min(1) }),
]);

export type ImportOptions = z.infer<typeof ImportOptionsSchema>;

const ImportErrorSchema = z
  .object({
    pieceIndex: z.number().int().openapi({ example: 1 }),
    pieceKey: z.string().optional().openapi({ example: "my-fragment" }),
    error: z.string().openapi({ example: "empty piece" }),
  })
  .openapi("ImportError");

export const ImportResultSchema = z
  .object({
    created: z.array(z.string()).openapi({ example: ["f1a2b3c4-d5e6-7890-abcd-ef1234567890"] }),
    errors: z.array(ImportErrorSchema),
  })
  .openapi("ImportResult");

// The import preview response is the shared { markdown, sections } shape — see
// `PreviewResultSchema` in ./preview. The route assembles the command's pieces
// through the same exporter core as sequence preview.

export const ImportBodySchema = z.object({
  file: z.any().openapi({
    type: "string",
    format: "binary",
    description: "File to import (.md, .txt, or .docx)",
  }),
  options: z.string().openapi({
    example: '{"format":"markdown","headingLevel":1}',
    description:
      'JSON string: {"format":"markdown","headingLevel":2} | {"format":"docx","headingLevel":1} | {"format":"plaintext","delimiter":"---"}',
  }),
});
