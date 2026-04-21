import { z } from "zod";

export const ReferenceSchema = z.object({
  uuid: z.uuid(),
  name: z.string(),
  content: z.string(),
});

export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceCreateSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
});

export type ReferenceCreate = z.infer<typeof ReferenceCreateSchema>;

export const ReferenceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().optional(),
});

export type ReferenceUpdate = z.infer<typeof ReferenceUpdateSchema>;
