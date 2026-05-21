import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import type { Reference } from "@maskor/shared";
import { validateEntityKey } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  ReferenceSchema,
  ReferenceUpdateResponseSchema,
  IndexedReferenceSchema,
  ReferenceUUIDParamSchema,
  ReferenceCreateSchema,
  ReferenceUpdateSchema,
  ReferenceExtractSchema,
  ReferenceInsertionSchema,
  ReferenceInsertionResponseSchema,
} from "../schemas/reference";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import {
  executeCommand,
  createReferenceCommand,
  extractReferenceCommand,
  insertReferenceCommand,
  updateReferenceCommand,
  deleteReferenceCommand,
  cutBodyCommand,
} from "../commands";
import type { CommandContext } from "../commands";
import type { UpdateSource } from "../commands/fragments/update-fragment";
import { resolveSourceKey } from "../helpers/resolve-source-key";

export const referencesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listReferencesRoute = createRoute({
  operationId: "listReferences",
  method: "get",
  path: "/",
  tags: ["References"],
  summary: "List all indexed references for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(IndexedReferenceSchema) } },
      description: "List of references",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getReferenceRoute = createRoute({
  operationId: "getReference",
  method: "get",
  path: "/{referenceId}",
  tags: ["References"],
  summary: "Get a single reference by UUID",
  request: { params: ReferenceUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceSchema } },
      description: "Reference",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Reference not found",
    },
    503: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Index temporarily out of sync — retry",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const extractReferenceRoute = createRoute({
  operationId: "extractReference",
  method: "post",
  path: "/extract",
  tags: ["References"],
  summary: "Extract selected text into a new reference",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: ReferenceExtractSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ReferenceSchema } },
      description: "New reference created from extraction",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Source entity not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Reference with this key already exists",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const appendReferenceRoute = createRoute({
  operationId: "appendReference",
  method: "post",
  path: "/{referenceId}/append",
  tags: ["References"],
  summary: "Append selected text to an existing reference",
  request: {
    params: ReferenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: ReferenceInsertionSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceInsertionResponseSchema } },
      description: "Reference updated with appended content",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Reference or source entity not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const prependReferenceRoute = createRoute({
  operationId: "prependReference",
  method: "post",
  path: "/{referenceId}/prepend",
  tags: ["References"],
  summary: "Prepend selected text to an existing reference",
  request: {
    params: ReferenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: ReferenceInsertionSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceInsertionResponseSchema } },
      description: "Reference updated with prepended content",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Reference or source entity not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const createReferenceRoute = createRoute({
  operationId: "createReference",
  method: "post",
  path: "/",
  tags: ["References"],
  summary: "Create a new reference in the vault",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: ReferenceCreateSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ReferenceSchema } },
      description: "Reference created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const updateReferenceRoute = createRoute({
  operationId: "updateReference",
  method: "patch",
  path: "/{referenceId}",
  tags: ["References"],
  summary: "Update a reference in the vault",
  request: {
    params: ReferenceUUIDParamSchema,
    body: { content: { "application/json": { schema: ReferenceUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ReferenceUpdateResponseSchema } },
      description: "Reference updated",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Reference not found",
    },
    503: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Index temporarily out of sync — retry",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteReferenceRoute = createRoute({
  operationId: "deleteReference",
  method: "delete",
  path: "/{referenceId}",
  tags: ["References"],
  summary: "Delete a reference from the vault",
  request: { params: ReferenceUUIDParamSchema },
  responses: {
    204: { description: "Reference deleted" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Reference not found",
    },
    503: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Index temporarily out of sync — retry",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

referencesRouter.openapi(extractReferenceRoute, async (ctx) => {
  const { key: rawKey, content, sourceUuid, sourceType, sourceMode, navigated } =
    ctx.req.valid("json");

  let key: string;
  try {
    key = validateEntityKey(rawKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid key";
    return ctx.json({ error: "INVALID_KEY", message }, 400);
  }

  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };

    const sourceKey = await resolveSourceKey(storageService, projectContext, sourceUuid, sourceType);

    const newReference: Reference = { uuid: randomUUID(), key, content };

    const reference = await executeCommand(extractReferenceCommand, commandContext, {
      newReference,
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    });

    return ctx.json(reference, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(appendReferenceRoute, async (ctx) => {
  const { referenceId } = ctx.req.valid("param");
  const { insertedBody, sourceUuid, sourceType, sourceMode, navigated } = ctx.req.valid("json");
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const sourceKey = await resolveSourceKey(storageService, projectContext, sourceUuid, sourceType);
    const reference = await executeCommand(insertReferenceCommand, commandContext, {
      referenceId,
      insertedBody,
      position: "append",
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    });
    if (sourceMode !== "cut") return ctx.json({ reference, sourceCutFailed: false }, 200);
    const cutSuccess = await executeCommand(cutBodyCommand, commandContext, {
      sourceType,
      sourceId: sourceUuid,
      textToRemove: insertedBody,
    });
    return ctx.json({ reference, sourceCutFailed: !cutSuccess }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(prependReferenceRoute, async (ctx) => {
  const { referenceId } = ctx.req.valid("param");
  const { insertedBody, sourceUuid, sourceType, sourceMode, navigated } = ctx.req.valid("json");
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const sourceKey = await resolveSourceKey(storageService, projectContext, sourceUuid, sourceType);
    const reference = await executeCommand(insertReferenceCommand, commandContext, {
      referenceId,
      insertedBody,
      position: "prepend",
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    });
    if (sourceMode !== "cut") return ctx.json({ reference, sourceCutFailed: false }, 200);
    const cutSuccess = await executeCommand(cutBodyCommand, commandContext, {
      sourceType,
      sourceId: sourceUuid,
      textToRemove: insertedBody,
    });
    return ctx.json({ reference, sourceCutFailed: !cutSuccess }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(listReferencesRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const references = await storageService.references.readAll(projectContext);
    return ctx.json(references, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(getReferenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { referenceId } = ctx.req.valid("param");
    const reference = await storageService.references.read(projectContext, referenceId);
    return ctx.json(reference, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(createReferenceRoute, async (ctx) => {
  const { key: rawKey, content } = ctx.req.valid("json");
  let key: string;
  try {
    key = validateEntityKey(rawKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid key";
    return ctx.json({ error: "INVALID_KEY", message }, 400);
  }

  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const reference: Reference = { uuid: randomUUID(), key, content };
    const result = await executeCommand(createReferenceCommand, commandContext, reference);
    return ctx.json(result, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(updateReferenceRoute, async (ctx) => {
  const { referenceId } = ctx.req.valid("param");
  const rawPatch = ctx.req.valid("json");
  let patch = rawPatch;
  if (rawPatch.key !== undefined) {
    try {
      patch = { ...rawPatch, key: validateEntityKey(rawPatch.key) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid key";
      return ctx.json({ error: "INVALID_KEY", message }, 400);
    }
  }

  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      logger: ctx.get("logger"),
    };
    const source: UpdateSource = patch.content !== undefined ? "user-content-save" : "programmatic";
    const updated = await executeCommand(updateReferenceCommand, commandContext, {
      referenceId,
      patch,
      source,
    });
    return ctx.json(updated, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

referencesRouter.openapi(deleteReferenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { referenceId } = ctx.req.valid("param");

    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };

    const reference = await storageService.references.read(projectContext, referenceId);
    await executeCommand(deleteReferenceCommand, commandContext, {
      referenceId,
      referenceKey: reference.key,
    });
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
