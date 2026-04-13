import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { StorageService, ProjectContext } from "@maskor/storage";
import { resolveProject } from "./middleware/resolve-project";
import { projectsRouter } from "./routes/projects";
import { fragmentsRouter } from "./routes/fragments";
import { aspectsRouter } from "./routes/aspects";
import { notesRouter } from "./routes/notes";
import { referencesRouter } from "./routes/references";
import { vaultIndexRouter } from "./routes/vault-index-routes";
import type { Logger } from "@maskor/shared";

export type AppVariables = {
  storageService: StorageService;
  projectContext?: ProjectContext;
};

export const createApp = (
  storageService: StorageService,
  logger?: Logger,
): OpenAPIHono<{ Variables: AppVariables }> => {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  const log: Logger =
    logger?.child({ module: "api" }) ??
    ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => log,
    } as unknown as Logger);

  // TODO: cors() with no args allows all origins (*). Once auth headers are added,
  // browsers will reject credentialed requests to a wildcard origin. Restrict to
  // the frontend origin before any auth integration.
  app.use("*", cors());

  app.use("*", async (ctx, next) => {
    const start = Date.now();
    await next();
    log.info(
      {
        method: ctx.req.method,
        path: new URL(ctx.req.url).pathname,
        status: ctx.res.status,
        durationMs: Date.now() - start,
      },
      "request",
    );
  });

  app.use("*", (ctx, next) => {
    ctx.set("storageService", storageService);
    return next();
  });

  app.route("/projects", projectsRouter);

  // Project-scoped sub-app with resolveProject middleware
  const projectScopedApp = new OpenAPIHono<{ Variables: AppVariables }>();
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

  app.doc("/doc", {
    openapi: "3.1.0",
    info: { title: "Maskor API", version: "0.1.0" },
  });

  app.get("/ui", swaggerUI({ url: "/doc" }));

  app.onError((error, ctx) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    log.error(
      {
        method: ctx.req.method,
        path: new URL(ctx.req.url).pathname,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "unhandled error",
    );
    return ctx.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" }, 500);
  });

  return app;
};
