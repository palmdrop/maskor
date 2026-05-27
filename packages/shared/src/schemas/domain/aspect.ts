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
