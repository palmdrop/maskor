import { z } from "@hono/zod-openapi";
import { ExportSeparatorSchema } from "@maskor/shared";

export const ExportSequenceParamSchema = z.object({
  projectId: z.uuid(),
  sequenceId: z.uuid(),
});

// Preflight counts for the Export dialog: how many annotations an export of the
// sequence would add. Raw counts — the dialog applies the toggles (references /
// margin annotations) when deciding what to show.
export const ExportAnnotationSummarySchema = z
  .object({
    referenceCount: z.number().int().openapi({
      description: "Distinct attached references across the sequence (one footnote each)",
      example: 3,
    }),
    commentCount: z.number().int().openapi({
      description: "Margin comments whose anchor is present in a fragment body",
      example: 5,
    }),
    noteCount: z.number().int().openapi({
      description: "Fragments with non-empty Margin notes (one annotation each)",
      example: 2,
    }),
    orphanedCommentCount: z.number().int().openapi({
      description: "Margin comments whose anchor is missing — skipped on export",
      example: 1,
    }),
  })
  .openapi("ExportAnnotationSummary");

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
    separator: ExportSeparatorSchema.optional().openapi({
      description:
        "Override: separator between fragments. `page-break` is a form feed in md/txt and a real page break in docx",
      example: "blank-line",
    }),
  })
  .openapi("ExportSequenceBody");
