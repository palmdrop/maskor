import { z } from "zod";

export const ProjectSchema = z.object({
  uuid: z.uuid(),
  name: z.string(),
  vaultPath: z.string(),
  notes: z.array(z.string()),
  aspects: z.array(z.string()),
  references: z.array(z.string()),
  arcs: z.array(z.string()),
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
});

export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
