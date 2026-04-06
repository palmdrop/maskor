import { Hono } from "hono";
import { cors } from "hono/cors";
import type { StorageService, ProjectContext } from "@maskor/storage";
import { resolveProject } from "./middleware/resolve-project";
import { projectsRouter } from "./routes/projects";
import { fragmentsRouter } from "./routes/fragments";
import { aspectsRouter } from "./routes/aspects";
import { notesRouter } from "./routes/notes";
import { referencesRouter } from "./routes/references";
import { vaultIndexRouter } from "./routes/vault-index-routes";

export type AppVariables = {
  storageService: StorageService;
  projectContext?: ProjectContext;
};

export const createApp = (storageService: StorageService): Hono<{ Variables: AppVariables }> => {
  const app = new Hono<{ Variables: AppVariables }>();

  // TODO: cors() with no args allows all origins (*). Once auth headers are added,
  // browsers will reject credentialed requests to a wildcard origin. Restrict to
  // the frontend origin before any auth integration.
  app.use("*", cors());

  app.use("*", (ctx, next) => {
    ctx.set("storageService", storageService);
    return next();
  });

  app.route("/projects", projectsRouter);

  // Project-scoped sub-app with resolveProject middleware
  const projectScopedApp = new Hono<{ Variables: AppVariables }>();
  projectScopedApp.use("*", resolveProject);
  projectScopedApp.route("/fragments", fragmentsRouter);
  projectScopedApp.route("/aspects", aspectsRouter);
  projectScopedApp.route("/notes", notesRouter);
  projectScopedApp.route("/references", referencesRouter);
  projectScopedApp.route("/index", vaultIndexRouter);

  // Note: use app.route(), not app.mount(). app.route() propagates parent context variables
  // (including storageService) to the sub-app. app.mount() creates an isolated sub-application
  // and context inheritance would break.
  app.route("/projects/:projectId", projectScopedApp);

  return app;
};
