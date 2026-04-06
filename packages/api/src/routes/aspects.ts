import { Hono } from "hono";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import type { AspectUUID } from "@maskor/shared";

export const aspectsRouter = new Hono<{ Variables: AppVariables }>();

aspectsRouter.get("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const aspects = await storageService.aspects.readAll(projectContext);
    return ctx.json(aspects);
  } catch (error) {
    return handleStorageError(error);
  }
});

aspectsRouter.get("/:aspectId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.param();
    const aspect = await storageService.aspects.read(projectContext, aspectId as AspectUUID);
    return ctx.json(aspect);
  } catch (error) {
    return handleStorageError(error);
  }
});
