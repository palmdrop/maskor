import { z } from "@hono/zod-openapi";
import {
  NoteSchema as DomainNoteSchema,
  NoteCreateSchema as DomainNoteCreateSchema,
  NoteUpdateSchema as DomainNoteUpdateSchema,
} from "@maskor/shared";

// List response — index layer fields
export const IndexedNoteSchema = DomainNoteSchema.pick({ uuid: true, key: true })
  .extend({
    uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "On solitude" }),
    filePath: z.string(),
  })
  .openapi("IndexedNote");

// Single-get response — vault type with content
export const NoteSchema = DomainNoteSchema.extend({
  uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
  key: z.string().openapi({ example: "On solitude" }),
}).openapi("Note");

export const NoteUUIDParamSchema = z.object({
  projectId: z.uuid(),
  noteId: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});

export const NoteCreateSchema = DomainNoteCreateSchema.extend({
  key: z.string().min(1).openapi({ example: "On solitude" }),
  content: z.string().openapi({ example: "A note body..." }),
}).openapi("NoteCreate");

export const NoteUpdateSchema = DomainNoteUpdateSchema.extend({
  key: z.string().min(1).optional().openapi({ example: "On solitude" }),
  content: z.string().optional().openapi({ example: "A note body..." }),
}).openapi("NoteUpdate");
