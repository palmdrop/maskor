import { z } from "zod";

export const ReferenceSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  content: z.string(),
});

export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceCreateSchema = z.object({
  key: z.string().min(1),
  content: z.string(),
});

export type ReferenceCreate = z.infer<typeof ReferenceCreateSchema>;

export const ReferenceUpdateSchema = z.object({
  key: z.string().min(1).optional(),
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
