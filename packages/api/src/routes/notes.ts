import { Hono } from "hono";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import type { NoteUUID } from "@maskor/shared";

export const notesRouter = new Hono<{ Variables: AppVariables }>();

notesRouter.get("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const notes = await storageService.notes.readAll(projectContext);
    return ctx.json(notes);
  } catch (error) {
    return handleStorageError(error);
  }
});

notesRouter.get("/:noteId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { noteId } = ctx.req.param();
    const note = await storageService.notes.read(projectContext, noteId as NoteUUID);
    return ctx.json(note);
  } catch (error) {
    return handleStorageError(error);
  }
});
