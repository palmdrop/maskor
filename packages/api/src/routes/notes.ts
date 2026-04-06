import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { NoteUUID } from "@maskor/shared";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import { NoteSchema, NoteUUIDParamSchema } from "../schemas/note";
import { ErrorResponseSchema } from "../schemas/error";

const projectIdParamSchema = z.object({ projectId: z.string().uuid() });

export const notesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listNotesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Notes"],
  summary: "List all indexed notes for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(NoteSchema) } },
      description: "List of notes",
    },
  },
});

const getNoteRoute = createRoute({
  method: "get",
  path: "/{noteId}",
  tags: ["Notes"],
  summary: "Get a single note by UUID",
  request: { params: NoteUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: NoteSchema } },
      description: "Note",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Note not found",
    },
  },
});

notesRouter.openapi(listNotesRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const notes = await storageService.notes.readAll(projectContext);
    return ctx.json(notes as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

notesRouter.openapi(getNoteRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { noteId } = ctx.req.valid("param");
    const note = await storageService.notes.read(projectContext, noteId as NoteUUID);
    return ctx.json(note as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});
