import { z } from "@hono/zod-openapi";

// List response — index layer fields
export const IndexedNoteSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    title: z.string().openapi({ example: "On solitude" }),
    filePath: z.string(),
  })
  .openapi("IndexedNote");

// Single-get response — vault type with content
export const NoteSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    title: z.string().openapi({ example: "On solitude" }),
    content: z.string(),
  })
  .openapi("Note");

export const NoteUUIDParamSchema = z.object({
  projectId: z.uuid(),
  noteId: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});

export const NoteCreateSchema = z
  .object({
    title: z.string().min(1).openapi({ example: "On solitude" }),
    content: z.string().openapi({ example: "A note body..." }),
  })
  .openapi("NoteCreate");
