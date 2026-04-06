import { Hono } from "hono";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import type { ReferenceUUID } from "@maskor/shared";

export const referencesRouter = new Hono<{ Variables: AppVariables }>();

referencesRouter.get("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const references = await storageService.references.readAll(projectContext);
    return ctx.json(references);
  } catch (error) {
    return handleStorageError(error);
  }
});

referencesRouter.get("/:referenceId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { referenceId } = ctx.req.param();
    const reference = await storageService.references.read(
      projectContext,
      referenceId as ReferenceUUID,
    );
    return ctx.json(reference);
  } catch (error) {
    return handleStorageError(error);
  }
});
