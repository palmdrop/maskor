import { z } from "zod";

export const AspectColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be a 6-digit hex string like #f97316");

export const AspectSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  category: z.string().optional(),
  color: AspectColorSchema.optional(),
  description: z.string().optional(),
  notes: z.array(z.string()),
  // Frontmatter keys Maskor does not manage (user-authored, e.g. Obsidian `tags`/`aliases`). Carried
  // through read→write so a Maskor save never strips user data. Storage-internal; omitted from API
  // responses. The managed `notes:` list is preserved separately — only *unmanaged* keys land here.
  extraFrontmatter: z.record(z.string(), z.unknown()).optional(),
});

export type Aspect = z.infer<typeof AspectSchema>;

export const AspectCreateSchema = z.object({
  key: z.string().min(1),
  color: AspectColorSchema.optional(),
  description: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

export type AspectCreate = z.infer<typeof AspectCreateSchema>;

export const AspectUpdateSchema = z.object({
  key: z.string().min(1).optional(),
  // `null` clears the category (moves to entity-type root); `undefined` leaves it unchanged.
  category: z.string().nullable().optional(),
  color: AspectColorSchema.nullable().optional(),
  description: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

export type AspectUpdate = z.infer<typeof AspectUpdateSchema>;

export const AspectUpdateResponseSchema = z.object({
  aspect: AspectSchema,
  warnings: z.array(z.string()),
});

export type AspectUpdateResponse = z.infer<typeof AspectUpdateResponseSchema>;
