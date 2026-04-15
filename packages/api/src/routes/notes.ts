import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import type { Note } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  NoteSchema,
  IndexedNoteSchema,
  NoteUUIDParamSchema,
  NoteCreateSchema,
} from "../schemas/note";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

export const notesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listNotesRoute = createRoute({
  operationId: "listNotes",
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
  operationId: "getNote",
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
    503: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Index temporarily out of sync — retry",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const createNoteRoute = createRoute({
  operationId: "createNote",
  method: "post",
  path: "/",
  tags: ["Notes"],
  summary: "Create a new note in the vault",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: NoteCreateSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: NoteSchema } },
      description: "Note created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteNoteRoute = createRoute({
  operationId: "deleteNote",
  method: "delete",
  path: "/{noteId}",
  tags: ["Notes"],
  summary: "Delete a note from the vault",
  request: { params: NoteUUIDParamSchema },
  responses: {
    204: { description: "Note deleted" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Note not found",
    },
    503: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Index temporarily out of sync — retry",
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

notesRouter.openapi(createNoteRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { title, content } = ctx.req.valid("json");

    const note: Note = {
      uuid: randomUUID(),
      title,
      content,
    };

    await storageService.notes.write(projectContext, note);
    return ctx.json(note, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

notesRouter.openapi(deleteNoteRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { noteId } = ctx.req.valid("param");

    await storageService.notes.delete(projectContext, noteId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
