import { z } from "@hono/zod-openapi";

export const ExportSequenceParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
});

export const ExportSequenceBodySchema = z
  .object({
    format: z.enum(["md", "txt", "docx"]).openapi({
      description: "Output format for the exported file",
      example: "md",
    }),
    // Per-export overrides of the project's `export` config toggles (the dialog's
    // current state). When present, each beats the persisted config; when absent,
    // the config value is used.
    includeReferences: z.boolean().optional().openapi({
      description: "Override: render attached references as footnotes",
      example: true,
    }),
    includeMarginAnnotations: z.boolean().optional().openapi({
      description: "Override: render Margin notes and comments as footnotes/comments",
      example: true,
    }),
  })
  .openapi("ExportSequenceBody");
