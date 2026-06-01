import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { RebuildStatsSchema } from "../schemas/vault-index";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import { executeCommand, rebuildIndexCommand, resetDatabaseCommand } from "../commands";
import type { CommandContext } from "../commands";

export const vaultIndexRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const rebuildIndexRoute = createRoute({
  operationId: "rebuildIndex",
  method: "post",
  path: "/rebuild",
  tags: ["Index"],
  summary: "Trigger a full vault index rebuild",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: RebuildStatsSchema } },
      description: "Rebuild complete",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

vaultIndexRouter.openapi(rebuildIndexRoute, async (ctx) => {
  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const stats = await executeCommand(rebuildIndexCommand, commandContext, undefined);
    return ctx.json(stats, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

const resetDatabaseRoute = createRoute({
  operationId: "resetDatabase",
  method: "post",
  path: "/reset",
  tags: ["Index"],
  summary: "Drop and re-derive the vault database",
  description:
    "Manual hard reset: drops the vault DB and rebuilds it from the vault. Recovers from DB " +
    "corruption / schema drift that a plain rebuild cannot fix. Discards DB-only state " +
    "(fragment_stats telemetry, dismissed UUID_COLLISION warnings).",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: RebuildStatsSchema } },
      description: "Reset complete",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

vaultIndexRouter.openapi(resetDatabaseRoute, async (ctx) => {
  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const stats = await executeCommand(resetDatabaseCommand, commandContext, undefined);
    return ctx.json(stats, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
