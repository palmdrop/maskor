import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { StoredWarning } from "@maskor/storage";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { VaultWarningListSchema, WarningIdParamSchema } from "../schemas/warnings";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import { executeCommand, dismissWarningCommand } from "../commands";
import type { CommandContext } from "../commands";

export const warningsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

// Drop the internal `dismissedAt` (the list never includes dismissed rows) and serialize the
// `createdAt` Date as an ISO string to match the response schema.
const toResponse = (warning: StoredWarning) => {
  const { dismissedAt: _dismissedAt, createdAt, ...rest } = warning;
  return { ...rest, createdAt: createdAt.toISOString() };
};

const listWarningsRoute = createRoute({
  operationId: "listWarnings",
  method: "get",
  path: "/",
  tags: ["Warnings"],
  summary: "List current (non-dismissed) vault warnings",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: VaultWarningListSchema } },
      description: "Current warnings",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const dismissWarningRoute = createRoute({
  operationId: "dismissWarning",
  method: "post",
  path: "/{id}/dismiss",
  tags: ["Warnings"],
  summary: "Dismiss an event warning (state warnings cannot be dismissed)",
  request: { params: WarningIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: VaultWarningListSchema } },
      description: "Warning dismissed; returns the remaining warnings",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Warning is a state warning and cannot be dismissed",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Warning not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

warningsRouter.openapi(listWarningsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const warnings = storageService.warnings.list(projectContext);
    return ctx.json(warnings.map(toResponse), 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

warningsRouter.openapi(dismissWarningRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { id } = ctx.req.valid("param");

    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const result = await executeCommand(dismissWarningCommand, commandContext, { id });
    if (result === "not_found") {
      return ctx.json({ error: "NOT_FOUND", message: `Warning ${id} not found` }, 404);
    }
    if (result === "not_event") {
      return ctx.json(
        {
          error: "WARNING_NOT_DISMISSABLE",
          message: "State warnings clear when their cause is fixed and cannot be dismissed",
        },
        400,
      );
    }

    const remaining = storageService.warnings.list(projectContext);
    return ctx.json(remaining.map(toResponse), 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
