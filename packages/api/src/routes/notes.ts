import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { NoteSchema, IndexedNoteSchema, NoteUUIDParamSchema } from "../schemas/note";
import { ErrorResponseSchema } from "../schemas/error";

const projectIdParamSchema = z.object({ projectId: z.uuid() });

export const notesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listNotesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Notes"],
  summary: "List all indexed notes for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(IndexedNoteSchema) } },
      description: "List of notes",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
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
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

notesRouter.openapi(listNotesRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const notes = await storageService.notes.readAll(projectContext);
    return ctx.json(notes, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

notesRouter.openapi(getNoteRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { noteId } = ctx.req.valid("param");
    const note = await storageService.notes.read(projectContext, noteId);
    return ctx.json(note, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
