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
    showTitles: z.boolean().optional().openapi({
      description: "Override: emit fragment titles as headings",
      example: false,
    }),
    showSectionHeadings: z.boolean().optional().openapi({
      description: "Override: emit section names as headings",
      example: true,
    }),
    separator: z.enum(["blank-line", "horizontal-rule", "page-break", "none"]).optional().openapi({
      description:
        "Override: separator between fragments. `page-break` is a form feed in md/txt and a real page break in docx",
      example: "blank-line",
    }),
  })
  .openapi("ExportSequenceBody");
