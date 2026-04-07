import { z } from "@hono/zod-openapi";

export const NoteSchema = z
  .object({
    uuid: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
    title: z.string().openapi({ example: "On solitude" }),
    filePath: z.string(),
  })
  .openapi("Note");

export const NoteUUIDParamSchema = z.object({
  projectId: z.uuid(),
  noteId: z.uuid().openapi({ example: "n1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});
