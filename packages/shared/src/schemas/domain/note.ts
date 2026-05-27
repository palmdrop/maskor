import { z } from "zod";

export const NoteSchema = z.object({
  uuid: z.uuid(),
  key: z.string(),
  category: z.string().optional(),
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
  // `null` clears the category (moves to entity-type root); `undefined` leaves it unchanged.
  category: z.string().nullable().optional(),
  content: z.string().optional(),
});

export type NoteUpdate = z.infer<typeof NoteUpdateSchema>;

export const NoteUpdateResponseSchema = z.object({
  note: NoteSchema,
  warnings: z.object({
    fragments: z.array(z.string()),
    aspects: z.array(z.string()),
  }),
});

export type NoteUpdateResponse = z.infer<typeof NoteUpdateResponseSchema>;
