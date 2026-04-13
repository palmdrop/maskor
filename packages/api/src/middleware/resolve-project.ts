import type { Context, Next } from "hono";
import { ProjectNotFoundError } from "@maskor/storage";
import type { AppVariables } from "../app";

// Tracks which projects have had their initial index rebuild triggered this process lifetime.
// Prevents redundant rebuilds on every request — the watcher keeps the index live after startup.
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
    // Start the watcher lazily on first project access. start() is idempotent — safe to
    // call on every request.
    storageService.watcher.start(projectContext);
    // Trigger a full index rebuild once per project per process lifetime. Fire-and-forget —
    // rebuild logs internally via StorageService. The watcher catches any changes that
    // arrive while the rebuild is in progress.
    if (!rebuiltProjects.has(projectContext.projectUUID)) {
      rebuiltProjects.add(projectContext.projectUUID);
      storageService.index.rebuild(projectContext).catch(() => {});
    }
    return next();
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return ctx.json({ error: "NOT_FOUND", message: error.message }, 404);
    }
    throw error;
  }
};
