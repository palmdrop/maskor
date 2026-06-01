import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  MarginSchema,
  OrphanedCommentSchema,
  MarginParamSchema,
  CommentParamSchema,
  MarginWriteSchema,
  CommentCreateSchema,
  CommentUpdateSchema,
} from "../schemas/margin";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import {
  executeCommand,
  writeMarginCommand,
  createCommentCommand,
  updateCommentCommand,
  deleteCommentCommand,
} from "../commands";
import type { CommandContext } from "../commands";

export const marginsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const commandContextFrom = (ctx: {
  get: (key: "storageService" | "projectContext" | "logger") => unknown;
}): CommandContext => ({
  storageService: ctx.get("storageService") as CommandContext["storageService"],
  projectContext: ctx.get("projectContext") as CommandContext["projectContext"],
  actor: "user",
  logger: ctx.get("logger") as CommandContext["logger"],
});

const listOrphanedCommentsRoute = createRoute({
  operationId: "listOrphanedComments",
  method: "get",
  path: "/orphaned",
  tags: ["Margins"],
  summary: "List every orphaned comment in the project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(OrphanedCommentSchema) } },
      description: "Orphaned comments",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
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

const createCommentRoute = createRoute({
  operationId: "createComment",
  method: "post",
  path: "/{fragmentId}/comments",
  tags: ["Margins"],
  summary: "Add a comment to a fragment's Margin",
  request: {
    params: MarginParamSchema,
    body: { content: { "application/json": { schema: CommentCreateSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: MarginSchema } },
      description: "Comment created",
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

const updateCommentRoute = createRoute({
  operationId: "updateComment",
  method: "patch",
  path: "/{fragmentId}/comments/{markerId}",
  tags: ["Margins"],
  summary: "Update a comment's excerpt and/or body",
  request: {
    params: CommentParamSchema,
    body: { content: { "application/json": { schema: CommentUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: MarginSchema } },
      description: "Comment updated",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Comment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteCommentRoute = createRoute({
  operationId: "deleteComment",
  method: "delete",
  path: "/{fragmentId}/comments/{markerId}",
  tags: ["Margins"],
  summary: "Delete a comment from a fragment's Margin",
  request: { params: CommentParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: MarginSchema } },
      description: "Comment deleted",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Margin not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

marginsRouter.openapi(listOrphanedCommentsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const orphaned = await storageService.margins.listOrphanedComments(projectContext);
    return ctx.json(orphaned, 200);
  } catch (error) {
    return throwStorageError(error);
  }
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
    const margin = await executeCommand(writeMarginCommand, commandContextFrom(ctx), {
      fragmentUuid: fragmentId,
      notes,
      comments,
    });
    return ctx.json(margin, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

marginsRouter.openapi(createCommentRoute, async (ctx) => {
  try {
    const { fragmentId } = ctx.req.valid("param");
    const comment = ctx.req.valid("json");
    const margin = await executeCommand(createCommentCommand, commandContextFrom(ctx), {
      fragmentUuid: fragmentId,
      comment,
    });
    return ctx.json(margin, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

marginsRouter.openapi(updateCommentRoute, async (ctx) => {
  try {
    const { fragmentId, markerId } = ctx.req.valid("param");
    const patch = ctx.req.valid("json");
    const margin = await executeCommand(updateCommentCommand, commandContextFrom(ctx), {
      fragmentUuid: fragmentId,
      markerId,
      patch,
    });
    return ctx.json(margin, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

marginsRouter.openapi(deleteCommentRoute, async (ctx) => {
  try {
    const { fragmentId, markerId } = ctx.req.valid("param");
    const margin = await executeCommand(deleteCommentCommand, commandContextFrom(ctx), {
      fragmentUuid: fragmentId,
      markerId,
    });
    return ctx.json(margin, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
