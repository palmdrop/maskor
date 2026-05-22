import type { Context, Next } from "hono";
import { ProjectNotFoundError } from "@maskor/storage";
import type { AppVariables } from "../app";
import { registerRebuild } from "./rebuild-state";

export const resolveProject = async (
  ctx: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> => {
  const storageService = ctx.get("storageService");
  const projectId = ctx.req.param("projectId") ?? "";

  try {
    const projectContext = await storageService.resolveProject(projectId);
    ctx.set("projectContext", projectContext);
    // Rebuild first, then start the watcher — spec startup sequence (storage-sync.md lines 67-70).
    // The watcher must not run concurrently with rebuild; starting it before rebuild completes
    // breaks the pause-based mutex.
    // registerRebuild returns the same promise for all concurrent requests so they all wait
    // for the single in-progress rebuild rather than each triggering an independent one.
    await registerRebuild(projectContext.projectUUID, async () => {
      await storageService.index.rebuild(projectContext);
    });
    // Start the watcher lazily on first project access. start() is idempotent — safe to
    // call on every request.
    storageService.watcher.start(projectContext);
    return next();
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return ctx.json({ error: "NOT_FOUND", message: error.message }, 404);
    }
    throw error;
  }
};
