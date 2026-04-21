import { z } from "zod";

export const AspectSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  notes: z.array(z.string()),
});

export type Aspect = z.infer<typeof AspectSchema>;

export const AspectCreateSchema = z.object({
  key: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

export type AspectCreate = z.infer<typeof AspectCreateSchema>;

export const AspectUpdateSchema = z.object({
  key: z.string().min(1).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  notes: z.array(z.string()).optional(),
});

export type AspectUpdate = z.infer<typeof AspectUpdateSchema>;
