import { Hono } from "hono";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";

export const vaultIndexRouter = new Hono<{ Variables: AppVariables }>();

vaultIndexRouter.post("/rebuild", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const stats = await storageService.index.rebuild(projectContext);
    return ctx.json(stats);
  } catch (error) {
    return handleStorageError(error);
  }
});
