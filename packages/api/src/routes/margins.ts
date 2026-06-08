import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { MarginSchema, MarginParamSchema, MarginWriteSchema } from "../schemas/margin";
import { ErrorResponseSchema } from "../schemas/error";
import { executeCommand, writeMarginCommand } from "../commands";
import type { CommandContext } from "../commands";

export const marginsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const commandContextFrom = (ctx: {
  get: (key: "storageService" | "projectContext" | "logger" | "correlationId") => unknown;
}): CommandContext => ({
  storageService: ctx.get("storageService") as CommandContext["storageService"],
  projectContext: ctx.get("projectContext") as CommandContext["projectContext"],
  actor: "user",
  logger: ctx.get("logger") as CommandContext["logger"],
  correlationId: ctx.get("correlationId") as CommandContext["correlationId"],
});

const getMarginRoute = createRoute({
  operationId: "getMargin",
  method: "get",
  path: "/{fragmentId}",
  tags: ["Margins"],
  summary: "Read a fragment's Margin",
  request: { params: MarginParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: MarginSchema } },
      description: "Margin",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No Margin for this fragment yet",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const writeMarginRoute = createRoute({
  operationId: "writeMargin",
  method: "put",
  path: "/{fragmentId}",
  tags: ["Margins"],
  summary: "Replace a fragment's Margin (notes + comments)",
  request: {
    params: MarginParamSchema,
    body: { content: { "application/json": { schema: MarginWriteSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: MarginSchema } },
      description: "Margin written",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

marginsRouter.openapi(getMarginRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");
    const margin = await storageService.margins.read(projectContext, fragmentId);
    if (!margin) {
      return ctx.json(
        { error: "MARGIN_NOT_FOUND", message: `No Margin for fragment "${fragmentId}"` },
        404,
      );
    }
    return ctx.json(margin, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

marginsRouter.openapi(writeMarginRoute, async (ctx) => {
  try {
    const { fragmentId } = ctx.req.valid("param");
    const { notes, comments } = ctx.req.valid("json");
    const margin = await executeCommand(
      writeMarginCommand,
      "margin:write",
      commandContextFrom(ctx),
      {
        fragmentUuid: fragmentId,
        notes,
        comments,
      },
    );
    return ctx.json(margin, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
