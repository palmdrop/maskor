import type { Context, Next } from "hono";
import { ProjectNotFoundError } from "@maskor/storage";
import type { AppVariables } from "../app";

// Tracks which projects have had their initial index rebuild triggered this process lifetime.
// Prevents redundant rebuilds on every request — the watcher keeps the index live after startup.
// TODO: This Set never shrinks. If a project is removed via removeProject() and re-added within
// the same process lifetime, the second registration will not trigger a rebuild. To fix, either
// delete from rebuiltProjects in removeProject(), or scope the Set to the StorageService instance.
const rebuiltProjects = new Set<string>();

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
    if (!rebuiltProjects.has(projectContext.projectUUID)) {
      rebuiltProjects.add(projectContext.projectUUID);
      await storageService.index.rebuild(projectContext);
    }
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
