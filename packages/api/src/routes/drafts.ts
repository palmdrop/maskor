import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  DraftSchema,
  DraftCreateBodySchema,
  DraftRestoreBodySchema,
  DraftRestoreResponseSchema,
  DraftUUIDParamSchema,
} from "../schemas/draft";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import {
  executeCommand,
  createDraftCommand,
  deleteDraftCommand,
  restoreDraftCommand,
} from "../commands";
import type { CommandContext } from "../commands";

export const draftsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listDraftsRoute = createRoute({
  operationId: "listDrafts",
  method: "get",
  path: "/",
  tags: ["Drafts"],
  summary: "List all drafts for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(DraftSchema) } },
      description: "Drafts",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const createDraftRoute = createRoute({
  operationId: "createDraft",
  method: "post",
  path: "/",
  tags: ["Drafts"],
  summary: "Create a new draft (snapshot) of the project",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: DraftCreateBodySchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: DraftSchema } },
      description: "Draft created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid draft name",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Name conflict or another draft operation in progress",
    },
    507: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Insufficient disk space",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteDraftRoute = createRoute({
  operationId: "deleteDraft",
  method: "delete",
  path: "/{draftId}",
  tags: ["Drafts"],
  summary: "Delete a draft",
  request: { params: DraftUUIDParamSchema },
  responses: {
    204: { description: "Draft deleted" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Draft not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const restoreDraftRoute = createRoute({
  operationId: "restoreDraft",
  method: "post",
  path: "/{draftId}/restore",
  tags: ["Drafts"],
  summary: "Restore the project to a draft (with optional pre-restore safety snapshot)",
  request: {
    params: DraftUUIDParamSchema,
    body: { content: { "application/json": { schema: DraftRestoreBodySchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DraftRestoreResponseSchema } },
      description: "Draft restored",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Draft not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Another draft operation in progress",
    },
    507: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Insufficient disk space (pre-restore snapshot)",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

draftsRouter.openapi(listDraftsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const drafts = await storageService.drafts.list(projectContext);
    return ctx.json(drafts, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

draftsRouter.openapi(createDraftRoute, async (ctx) => {
  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const { name, note } = ctx.req.valid("json");
    const draft = await executeCommand(createDraftCommand, commandContext, { name, note });
    return ctx.json(draft, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

draftsRouter.openapi(deleteDraftRoute, async (ctx) => {
  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const { draftId } = ctx.req.valid("param");
    await executeCommand(deleteDraftCommand, commandContext, { draftUuid: draftId });
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

draftsRouter.openapi(restoreDraftRoute, async (ctx) => {
  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const { draftId } = ctx.req.valid("param");
    const { saveCurrentFirst, preRestoreName } = ctx.req.valid("json");
    const result = await executeCommand(restoreDraftCommand, commandContext, {
      draftUuid: draftId,
      saveCurrentFirst,
      preRestoreName,
    });
    return ctx.json(result, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
