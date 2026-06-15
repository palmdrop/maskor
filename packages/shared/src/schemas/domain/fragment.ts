import { z } from "zod";

export const AspectWeightsSchema = z.record(
  z.string(),
  z.object({ weight: z.number().default(0) }),
);

export const FragmentSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  content: z.string(),
  readiness: z.number().min(0).max(1),
  contentHash: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  references: z.array(z.string()),
  isDiscarded: z.boolean(),
  aspects: AspectWeightsSchema,
  // Frontmatter keys Maskor does not manage (user-authored, e.g. Obsidian `tags`/`aliases`). Carried
  // through read→write so a Maskor save never strips user data. Storage-internal; omitted from API
  // responses.
  extraFrontmatter: z.record(z.string(), z.unknown()).optional(),
});

export type AspectWeights = z.infer<typeof AspectWeightsSchema>;
export type Fragment = z.infer<typeof FragmentSchema>;

export const FragmentCreateSchema = z.object({
  key: z.string().min(1),
  content: z.string().min(1),
});

export const FragmentUpdateSchema = z.object({
  key: z.string().min(1).optional(),
  content: z.string().optional(),
  readiness: z.number().min(0).max(1).optional(),
  references: z.array(z.string()).optional(),
  aspects: AspectWeightsSchema.optional(),
});

export type FragmentCreate = z.infer<typeof FragmentCreateSchema>;
export type FragmentUpdate = z.infer<typeof FragmentUpdateSchema>;

export const FragmentUpdateResponseSchema = z.object({
  fragment: FragmentSchema,
  warnings: z.array(z.string()),
});

export type FragmentUpdateResponse = z.infer<typeof FragmentUpdateResponseSchema>;
