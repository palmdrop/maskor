import type { Context, Next } from "hono";
import { ProjectNotFoundError } from "@maskor/storage";
import type { ProjectUUID } from "@maskor/shared";
import type { AppVariables } from "../app";

export const resolveProject = async (
  ctx: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> => {
  const storageService = ctx.get("storageService");
  const projectId = ctx.req.param("projectId");

  try {
    const projectContext = await storageService.resolveProject(projectId as ProjectUUID);
    ctx.set("projectContext", projectContext);
    return next();
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return ctx.json({ error: "NOT_FOUND", message: error.message }, 404);
    }
    throw error;
  }
};
