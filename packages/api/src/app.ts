import { randomUUID } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { createSettingsService, DEFAULT_CONFIG_DIRECTORY } from "@maskor/storage";
import type { StorageService, ProjectContext, SettingsService } from "@maskor/storage";
import { OPENAPI_DOCUMENT_CONFIG } from "./openapi-config";
import { resolveProject } from "./middleware/resolve-project";
import { projectsRouter } from "./routes/projects";
import { fragmentsRouter } from "./routes/fragments";
import { aspectsRouter } from "./routes/aspects";
import { notesRouter } from "./routes/notes";
import { referencesRouter } from "./routes/references";
import { marginsRouter } from "./routes/margins";
import { vaultIndexRouter } from "./routes/vault-index-routes";
import { warningsRouter } from "./routes/warnings";
import { eventsRouter } from "./routes/events";
import { suggestionRouter } from "./routes/suggestion";
import { statsRouter } from "./routes/stats";
import { actionLogRouter } from "./routes/action-log";
import { sequencesRouter } from "./routes/sequences";
import { importRouter } from "./routes/import";
import { importPreviewRouter } from "./routes/import-preview";
import { previewRouter } from "./routes/preview";
import { draftsRouter } from "./routes/drafts";
import { swapRouter } from "./routes/swap";
import { fsRouter } from "./routes/fs";
import { createSettingsRouter } from "./routes/settings";
import type { Logger } from "@maskor/shared/logger";

export type AppVariables = {
  storageService: StorageService;
  settingsService: SettingsService;
  projectContext?: ProjectContext;
  logger: Logger;
  correlationId: string;
};

export const createApp = (
  storageService: StorageService,
  logger?: Logger,
  configDirectory: string = DEFAULT_CONFIG_DIRECTORY,
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
        correlationId: ctx.get("correlationId"),
      },
      "request",
    );
  });

  // Correlation ID: one per request, reused from the client header if supplied,
  // otherwise generated. Echoed on success responses; error responses get it
  // stamped in `onError` (a thrown HTTPException replaces ctx.res, dropping
  // headers set here). Every action log entry carries this id (see executeCommand).
  app.use("*", async (ctx, next) => {
    const correlationId = ctx.req.header("X-Correlation-Id") ?? randomUUID();
    ctx.set("correlationId", correlationId);
    await next();
    ctx.header("X-Correlation-Id", correlationId);
  });

  const settingsService = createSettingsService(configDirectory);

  app.use("*", (ctx, next) => {
    ctx.set("storageService", storageService);
    ctx.set("settingsService", settingsService);
    ctx.set("logger", log);
    return next();
  });

  app.route("/projects", projectsRouter);
  app.route("/fs", fsRouter);
  app.route("/settings", createSettingsRouter(settingsService));

  // Project-scoped sub-app with resolveProject middleware
  const projectScopedApp = new OpenAPIHono<{ Variables: AppVariables }>();
  projectScopedApp.use("*", resolveProject);
  projectScopedApp.route("/fragments", fragmentsRouter);
  projectScopedApp.route("/aspects", aspectsRouter);
  projectScopedApp.route("/notes", notesRouter);
  projectScopedApp.route("/references", referencesRouter);
  projectScopedApp.route("/margins", marginsRouter);
  projectScopedApp.route("/index", vaultIndexRouter);
  projectScopedApp.route("/warnings", warningsRouter);
  projectScopedApp.route("/events", eventsRouter);
  projectScopedApp.route("/suggestion", suggestionRouter);
  projectScopedApp.route("/stats", statsRouter);
  projectScopedApp.route("/action-log", actionLogRouter);
  projectScopedApp.route("/sequences", sequencesRouter);
  projectScopedApp.route("/import", importRouter);
  projectScopedApp.route("/import/preview", importPreviewRouter);
  projectScopedApp.route("/preview", previewRouter);
  projectScopedApp.route("/drafts", draftsRouter);
  projectScopedApp.route("/swap", swapRouter);

  // Note: use app.route(), not app.mount(). app.route() propagates parent context variables
  // (including storageService) to the sub-app. app.mount() creates an isolated sub-application
  // and context inheritance would break.
  app.route("/projects/:projectId", projectScopedApp);

  app.doc("/doc", OPENAPI_DOCUMENT_CONFIG);

  app.get("/ui", swaggerUI({ url: "/doc" }));

  app.onError((error, ctx) => {
    // Single chokepoint for stamping the correlation ID onto error responses —
    // covers every path, including HTTPExceptions built by throwStorageError
    // whose custom response would otherwise drop the header set in middleware.
    const correlationId = ctx.get("correlationId") ?? randomUUID();
    if (error instanceof HTTPException) {
      const response = error.getResponse();
      const withCorrelation = new Response(response.body, response);
      withCorrelation.headers.set("X-Correlation-Id", correlationId);
      return withCorrelation;
    }
    log.error(
      {
        method: ctx.req.method,
        path: new URL(ctx.req.url).pathname,
        errorMessage: error instanceof Error ? error.message : String(error),
        correlationId,
      },
      "unhandled error",
    );
    ctx.header("X-Correlation-Id", correlationId);
    return ctx.json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" }, 500);
  });

  return app;
};
