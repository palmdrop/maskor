import { z } from "zod";

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
    maxParagraphWidth: z.number().int().min(40).max(120),
  }),
  suggestion: z.object({
    readinessThreshold: z.number().min(0).max(1),
    currentFragmentUUID: z.uuid().optional(),
  }),
  advanced: z.object({
    showFragmentStats: z.boolean(),
  }),
  preview: z.object({
    showTitles: z.boolean(),
    showSectionHeadings: z.boolean(),
    separator: z.enum(["blank-line", "horizontal-rule", "none"]),
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
      maxParagraphWidth: z.number().int().min(40).max(120).optional(),
    })
    .optional(),
  suggestion: z
    .object({
      readinessThreshold: z.number().min(0).max(1).optional(),
      currentFragmentUUID: z.uuid().optional(),
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
});

export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
