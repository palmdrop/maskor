import { z } from "@hono/zod-openapi";
import {
  NoteSchema as DomainNoteSchema,
  NoteCreateSchema as DomainNoteCreateSchema,
  NoteUpdateSchema as DomainNoteUpdateSchema,
  NoteUpdateResponseSchema as DomainNoteUpdateResponseSchema,
} from "@maskor/shared";
import { InsertionBodySchema } from "./shared";

// List response — index layer fields
export const IndexedNoteSchema = DomainNoteSchema.pick({ uuid: true, key: true })
  .extend({
    uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "On solitude" }),
    category: z.string().optional().openapi({ example: "research" }),
    filePath: z.string(),
  })
  .openapi("IndexedNote");

// Single-get response — vault type with content
export const NoteSchema = DomainNoteSchema.omit({ extraFrontmatter: true })
  .extend({
    uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    key: z.string().openapi({ example: "On solitude" }),
    category: z.string().optional().openapi({ example: "research" }),
  })
  .openapi("Note");

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
  category: z.string().nullable().optional().openapi({ example: "research" }),
  content: z.string().optional().openapi({ example: "A note body..." }),
}).openapi("NoteUpdate");

export const NoteUpdateResponseSchema = DomainNoteUpdateResponseSchema.extend({
  note: NoteSchema,
}).openapi("NoteUpdateResponse");

export const NoteExtractSchema = z
  .object({
    key: z.string().min(1).openapi({ example: "On solitude" }),
    content: z.string().min(1).openapi({ example: "A note body..." }),
    sourceUuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    sourceType: z
      .enum(["fragment", "note", "reference", "aspect"])
      .openapi({ example: "fragment" }),
    sourceMode: z.enum(["keep"]).openapi({ example: "keep" }),
    navigated: z.boolean().openapi({ example: true }),
  })
  .openapi("NoteExtract");

export const NoteInsertionSchema = InsertionBodySchema.openapi("NoteInsertion");

export const NoteInsertionResponseSchema = z
  .object({
    note: NoteSchema,
    sourceCutFailed: z.boolean().openapi({ example: false }),
  })
  .openapi("NoteInsertionResponse");
