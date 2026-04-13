import type { Context, Next } from "hono";
import { ProjectNotFoundError } from "@maskor/storage";
import type { AppVariables } from "../app";

export const resolveProject = async (
  ctx: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> => {
  const storageService = ctx.get("storageService");
  const projectId = ctx.req.param("projectId") ?? "";

  try {
    const projectContext = await storageService.resolveProject(projectId);
    ctx.set("projectContext", projectContext);
    // Start the watcher lazily on first project access. start() is idempotent — safe to
    // call on every request. Rebuild must be called separately before starting for a clean
    // baseline (POST /index/rebuild), but the watcher will still catch any changes that
    // happen after server startup even without an explicit rebuild.
    storageService.watcher.start(projectContext);
    return next();
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return ctx.json({ error: "NOT_FOUND", message: error.message }, 404);
    }
    throw error;
  }
};
