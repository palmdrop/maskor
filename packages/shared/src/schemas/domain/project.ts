import { z } from "zod";
import { LanguageCodeSchema } from "./language";

export const ProjectSchema = z.object({
  uuid: z.uuid(),
  name: z.string(),
  vaultPath: z.string(),
  notes: z.array(z.string()),
  aspects: z.array(z.string()),
  references: z.array(z.string()),
  arcs: z.array(z.string()),
  editor: z.object({
    vimMode: z.boolean(),
    rawMarkdownMode: z.boolean(),
    fontSize: z.number().int().min(12).max(24),
    marginFontSize: z.number().int().min(10).max(22),
    maxParagraphWidth: z.number().int().min(40).max(120),
    vimClipboardSync: z.boolean(),
    // BCP-47 writing language for native spell-check; empty string = browser/OS default.
    language: LanguageCodeSchema,
  }),
  suggestion: z.object({
    readinessThreshold: z.number().min(0).max(1),
  }),
  advanced: z.object({
    showFragmentStats: z.boolean(),
  }),
  preview: z.object({
    showTitles: z.boolean(),
    showSectionHeadings: z.boolean(),
    separator: z.enum(["blank-line", "horizontal-rule", "none"]),
  }),
  export: z.object({
    includeReferences: z.boolean(),
    includeMarginAnnotations: z.boolean(),
    showTitles: z.boolean(),
    showSectionHeadings: z.boolean(),
    // Export-owned assembly separator — a superset of the preview separators:
    // `page-break` renders as a form feed in md/txt and a real page break in docx.
    separator: z.enum(["blank-line", "horizontal-rule", "page-break", "none"]),
  }),
  overview: z.object({
    detailLevel: z.enum(["prose", "excerpt", "title"]),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  vaultPath: z.string().min(1),
});

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  editor: z
    .object({
      vimMode: z.boolean().optional(),
      rawMarkdownMode: z.boolean().optional(),
      fontSize: z.number().int().min(12).max(24).optional(),
      marginFontSize: z.number().int().min(10).max(22).optional(),
      maxParagraphWidth: z.number().int().min(40).max(120).optional(),
      vimClipboardSync: z.boolean().optional(),
      language: LanguageCodeSchema.optional(),
    })
    .optional(),
  suggestion: z
    .object({
      readinessThreshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
  advanced: z
    .object({
      showFragmentStats: z.boolean().optional(),
    })
    .optional(),
  preview: z
    .object({
      showTitles: z.boolean().optional(),
      showSectionHeadings: z.boolean().optional(),
      separator: z.enum(["blank-line", "horizontal-rule", "none"]).optional(),
    })
    .optional(),
  export: z
    .object({
      includeReferences: z.boolean().optional(),
      includeMarginAnnotations: z.boolean().optional(),
      showTitles: z.boolean().optional(),
      showSectionHeadings: z.boolean().optional(),
      separator: z.enum(["blank-line", "horizontal-rule", "page-break", "none"]).optional(),
    })
    .optional(),
  overview: z
    .object({
      detailLevel: z.enum(["prose", "excerpt", "title"]).optional(),
    })
    .optional(),
});

export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
