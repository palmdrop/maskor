import { z } from "zod";

export const FragmentPropertiesSchema = z.record(z.string(), z.object({ weight: z.number() }));

export const FragmentSchema = z.object({
  uuid: z.uuid(),
  version: z.int(),
  title: z.string(),
  content: z.string(),
  readyStatus: z.number().min(0).max(1),
  contentHash: z.string(),
  updatedAt: z.date(),
  notes: z.array(z.string()),
  references: z.array(z.string()),
  isDiscarded: z.boolean(),
  properties: FragmentPropertiesSchema,
});

export type FragmentProperties = z.infer<typeof FragmentPropertiesSchema>;
export type Fragment = z.infer<typeof FragmentSchema>;

export const FragmentCreateSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

export const FragmentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  readyStatus: z.number().min(0).max(1).optional(),
  notes: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  properties: FragmentPropertiesSchema.optional(),
});

export type FragmentCreate = z.infer<typeof FragmentCreateSchema>;
export type FragmentUpdate = z.infer<typeof FragmentUpdateSchema>;
