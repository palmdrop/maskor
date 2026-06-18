import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { ErrorResponseSchema } from "../schemas/error";
import { z } from "@hono/zod-openapi";
import {
  SwapListResponseSchema,
  SwapParamSchema,
  SwapReadResponseSchema,
  SwapWriteBodySchema,
  SwapWriteResponseSchema,
} from "../schemas/swap";

export const swapRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listSwapsRoute = createRoute({
  operationId: "listSwaps",
  method: "get",
  path: "/",
  tags: ["Swap"],
  summary: "List all entities that currently have an unsaved-content swap file",
  request: { params: z.object({ projectId: z.uuid() }) },
  responses: {
    200: {
      content: { "application/json": { schema: SwapListResponseSchema } },
      description: "Swap entries for every entity with unsaved content",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const putSwapRoute = createRoute({
  operationId: "putSwap",
  method: "put",
  path: "/{entityType}/{entityUUID}",
  tags: ["Swap"],
  summary: "Write a swap file for unsaved entity content",
  request: {
    params: SwapParamSchema,
    body: { content: { "application/json": { schema: SwapWriteBodySchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SwapWriteResponseSchema } },
      description: "Swap written",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid entity type or body",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getSwapRoute = createRoute({
  operationId: "getSwap",
  method: "get",
  path: "/{entityType}/{entityUUID}",
  tags: ["Swap"],
  summary: "Read the swap file for unsaved entity content",
  request: { params: SwapParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SwapReadResponseSchema } },
      description: "Swap content; content and savedAt are null when no swap exists",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteSwapRoute = createRoute({
  operationId: "deleteSwap",
  method: "delete",
  path: "/{entityType}/{entityUUID}",
  tags: ["Swap"],
  summary: "Delete the swap file for an entity (idempotent)",
  request: { params: SwapParamSchema },
  responses: {
    204: { description: "Swap deleted (or already absent)" },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

swapRouter.openapi(listSwapsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const entries = await storageService.swap.list(projectContext);
    return ctx.json({ entries }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

swapRouter.openapi(putSwapRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { entityType, entityUUID } = ctx.req.valid("param");
    const { content } = ctx.req.valid("json");
    const result = await storageService.swap.write(projectContext, entityType, entityUUID, content);
    return ctx.json({ savedAt: result.savedAt }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

swapRouter.openapi(getSwapRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { entityType, entityUUID } = ctx.req.valid("param");
    const result = await storageService.swap.read(projectContext, entityType, entityUUID);
    return ctx.json(result ?? { content: null, savedAt: null }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

swapRouter.openapi(deleteSwapRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { entityType, entityUUID } = ctx.req.valid("param");
    await storageService.swap.delete(projectContext, entityType, entityUUID);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
