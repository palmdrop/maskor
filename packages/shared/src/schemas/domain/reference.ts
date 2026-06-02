import { z } from "zod";

export const ReferenceSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  category: z.string().optional(),
  content: z.string(),
  // Frontmatter keys Maskor does not manage (user-authored, e.g. Obsidian `tags`/`aliases`). Carried
  // through read→write so a Maskor save never strips user data. Storage-internal; omitted from API
  // responses.
  extraFrontmatter: z.record(z.string(), z.unknown()).optional(),
});

export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceCreateSchema = z.object({
  key: z.string().min(1),
  content: z.string(),
});

export type ReferenceCreate = z.infer<typeof ReferenceCreateSchema>;

export const ReferenceUpdateSchema = z.object({
  key: z.string().min(1).optional(),
  // `null` clears the category (moves to entity-type root); `undefined` leaves it unchanged.
  category: z.string().nullable().optional(),
  content: z.string().optional(),
});

export type ReferenceUpdate = z.infer<typeof ReferenceUpdateSchema>;

export const ReferenceUpdateResponseSchema = z.object({
  reference: ReferenceSchema,
  warnings: z.object({
    fragments: z.array(z.string()),
  }),
});

export type ReferenceUpdateResponse = z.infer<typeof ReferenceUpdateResponseSchema>;
