import { z } from "zod";

export const NoteSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  content: z.string(),
});

export type Note = z.infer<typeof NoteSchema>;

export const NoteCreateSchema = z.object({
  key: z.string().min(1),
  content: z.string(),
});

export type NoteCreate = z.infer<typeof NoteCreateSchema>;

export const NoteUpdateSchema = z.object({
  key: z.string().min(1).optional(),
  content: z.string().optional(),
});

export type NoteUpdate = z.infer<typeof NoteUpdateSchema>;
