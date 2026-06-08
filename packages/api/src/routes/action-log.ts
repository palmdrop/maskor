import { randomUUID } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { LogEntryListSchema } from "@maskor/shared";
import type { LogEntry } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { projectIdParamSchema } from "../schemas/shared";

export const actionLogRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const listActionLogRoute = createRoute({
  operationId: "listActionLog",
  method: "get",
  path: "/",
  tags: ["ActionLog"],
  summary: "List recent action log entries for a project",
  request: {
    params: projectIdParamSchema,
    query: z.object({
      limit: z
        .string()
        .optional()
        .transform((value) => {
          const parsed = value ? parseInt(value, 10) : DEFAULT_LIMIT;
          return Math.min(isNaN(parsed) ? DEFAULT_LIMIT : parsed, MAX_LIMIT);
        }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: LogEntryListSchema } },
      description: "Recent action log entries, most-recent-first",
    },
    500: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), message: z.string() }),
        },
      },
      description: "Internal error",
    },
  },
});

actionLogRouter.openapi(listActionLogRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { limit } = ctx.req.valid("query");
    const entries = await storageService.actionLog.readRecent(projectContext, limit);
    return ctx.json(entries, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

const recordCommandErrorRoute = createRoute({
  operationId: "recordCommandError",
  method: "post",
  path: "/errors",
  tags: ["ActionLog"],
  summary: "Record a frontend-only command failure as a command:error entry",
  request: {
    params: projectIdParamSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            commandId: z.string(),
            correlationId: z.string(),
            friendlyMessage: z.string().optional(),
            technicalMessage: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    204: { description: "Recorded" },
    500: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), message: z.string() }),
        },
      },
      description: "Internal error",
    },
  },
});

// Direct append (no executeCommand wrapper): this records failures that never
// reached the backend's command pipeline — frontend-only or pre-flight/network
// failures. The frontend supplies the correlationId and the intent-level commandId.
actionLogRouter.openapi(recordCommandErrorRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { commandId, correlationId, friendlyMessage, technicalMessage } = ctx.req.valid("json");
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      correlationId,
      type: "command:error",
      actor: "system",
      undoable: false,
      payload: { commandId, friendlyMessage, technicalMessage },
    };
    await storageService.actionLog.append(projectContext, entry);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
