import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import type { Fragment } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { validateEntityKey } from "@maskor/shared";
import {
  FragmentSchema,
  FragmentSummarySchema,
  FragmentUpdateResponseSchema,
  IndexedFragmentSchema,
  FragmentCreateSchema,
  FragmentUpdateSchema,
  FragmentUUIDParamSchema,
  FragmentExtractSchema,
  FragmentInsertionSchema,
  FragmentInsertionResponseSchema,
} from "../schemas/fragment";
import { FragmentStatsSchema } from "../schemas/stats";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import {
  executeCommand,
  createFragmentCommand,
  extractFragmentCommand,
  insertFragmentCommand,
  updateFragmentCommand,
  discardFragmentCommand,
  restoreFragmentCommand,
  deleteFragmentCommand,
  cutBodyCommand,
} from "../commands";
import type { CommandContext } from "../commands";
import type { UpdateSource } from "../commands/fragments/update-fragment";
import { resolveSourceKey } from "../helpers/resolve-source-key";

const classifyFragmentSource = (patch: {
  content?: unknown;
  readiness?: unknown;
  notes?: unknown;
  references?: unknown;
  aspects?: unknown;
}): UpdateSource => {
  const hasContent = patch.content !== undefined;
  const hasMetadata =
    patch.readiness !== undefined ||
    patch.notes !== undefined ||
    patch.references !== undefined ||
    patch.aspects !== undefined;
  if (hasContent && !hasMetadata) return "user-content-save";
  if (!hasContent && hasMetadata) return "user-metadata";
  return "programmatic";
};

export const fragmentsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listFragmentSummariesRoute = createRoute({
  operationId: "listFragmentSummaries",
  method: "get",
  path: "/summaries",
  tags: ["Fragments"],
  summary: "List minimal fragment data (uuid, key, isDiscarded, excerpt) for all fragments",
  request: {
    params: projectIdParamSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(FragmentSummarySchema) } },
      description: "List of fragment summaries",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const listFragmentsRoute = createRoute({
  operationId: "listFragments",
  method: "get",
  path: "/",
  tags: ["Fragments"],
  summary: "List all indexed fragments for a project",
  request: {
    params: projectIdParamSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(IndexedFragmentSchema) } },
      description: "List of fragments",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getFragmentRoute = createRoute({
  operationId: "getFragment",
  method: "get",
  path: "/{fragmentId}",
  tags: ["Fragments"],
  summary: "Get a single fragment by UUID",
  request: { params: FragmentUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: FragmentSchema } },
      description: "Fragment",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
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

const createFragmentRoute = createRoute({
  operationId: "createFragment",
  method: "post",
  path: "/",
  tags: ["Fragments"],
  summary: "Write a new fragment to the vault",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: FragmentCreateSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: FragmentSchema } },
      description: "Fragment created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment with this key already exists",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const extractFragmentRoute = createRoute({
  operationId: "extractFragment",
  method: "post",
  path: "/extract",
  tags: ["Fragments"],
  summary: "Extract selected text into a new fragment",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: FragmentExtractSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: FragmentSchema } },
      description: "New fragment created from extraction",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Source fragment not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment with this key already exists",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const appendFragmentRoute = createRoute({
  operationId: "appendFragment",
  method: "post",
  path: "/{fragmentId}/append",
  tags: ["Fragments"],
  summary: "Append selected text to an existing fragment",
  request: {
    params: FragmentUUIDParamSchema,
    body: { content: { "application/json": { schema: FragmentInsertionSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FragmentInsertionResponseSchema } },
      description: "Fragment updated with appended content",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment or source entity not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const prependFragmentRoute = createRoute({
  operationId: "prependFragment",
  method: "post",
  path: "/{fragmentId}/prepend",
  tags: ["Fragments"],
  summary: "Prepend selected text to an existing fragment",
  request: {
    params: FragmentUUIDParamSchema,
    body: { content: { "application/json": { schema: FragmentInsertionSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FragmentInsertionResponseSchema } },
      description: "Fragment updated with prepended content",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment or source entity not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const updateFragmentRoute = createRoute({
  operationId: "updateFragment",
  method: "patch",
  path: "/{fragmentId}",
  tags: ["Fragments"],
  summary: "Partially update a fragment's fields",
  request: {
    params: FragmentUUIDParamSchema,
    body: { content: { "application/json": { schema: FragmentUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FragmentUpdateResponseSchema } },
      description: "Updated fragment",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body or invalid key",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment with this key already exists",
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

const discardFragmentRoute = createRoute({
  operationId: "discardFragment",
  method: "delete",
  path: "/{fragmentId}",
  tags: ["Fragments"],
  summary: "Discard a fragment (moves to discarded/)",
  request: { params: FragmentUUIDParamSchema },
  responses: {
    204: { description: "Fragment discarded" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
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

const deleteFragmentRoute = createRoute({
  operationId: "deleteFragment",
  method: "delete",
  path: "/{fragmentId}/permanent",
  tags: ["Fragments"],
  summary: "Permanently delete a discarded fragment (removes the file)",
  request: { params: FragmentUUIDParamSchema },
  responses: {
    204: { description: "Fragment permanently deleted" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment is not discarded",
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

const restoreFragmentRoute = createRoute({
  operationId: "restoreFragment",
  method: "post",
  path: "/{fragmentId}/restore",
  tags: ["Fragments"],
  summary: "Restore a discarded fragment (moves out of discarded/)",
  request: { params: FragmentUUIDParamSchema },
  responses: {
    204: { description: "Fragment restored" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Active fragment with this key already exists",
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

const getFragmentStatsRoute = createRoute({
  operationId: "getFragmentStats",
  method: "get",
  path: "/{fragmentId}/stats",
  tags: ["Stats"],
  summary: "Get stats for a single fragment",
  request: { params: FragmentUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: FragmentStatsSchema } },
      description: "Fragment stats",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

fragmentsRouter.openapi(listFragmentSummariesRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const summaries = await storageService.fragments.readAllSummaries(projectContext);
    return ctx.json(summaries, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(listFragmentsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const fragments = await storageService.fragments.readAll(projectContext);
    return ctx.json(fragments, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(getFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");
    const fragment = await storageService.fragments.read(projectContext, fragmentId);
    return ctx.json(fragment, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(createFragmentRoute, async (ctx) => {
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

    const draft: Fragment = {
      uuid: randomUUID(),
      key,
      content,
      isDiscarded: false,
      readiness: 0,
      notes: [],
      references: [],
      aspects: {},
      contentHash: "",
      updatedAt: new Date(),
    };

    const fragment = await executeCommand(createFragmentCommand, commandContext, draft);
    return ctx.json(fragment, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(extractFragmentRoute, async (ctx) => {
  const {
    key: rawKey,
    content,
    sourceUuid,
    sourceType,
    sourceMode,
    navigated,
  } = ctx.req.valid("json");

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

    const sourceKey = await resolveSourceKey(
      storageService,
      projectContext,
      sourceUuid,
      sourceType,
    );

    const newFragment: Fragment = {
      uuid: randomUUID(),
      key,
      content,
      isDiscarded: false,
      readiness: 0,
      notes: [],
      references: [],
      aspects: {},
      contentHash: "",
      updatedAt: new Date(),
    };

    const fragment = await executeCommand(extractFragmentCommand, commandContext, {
      newFragment,
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    });

    return ctx.json(fragment, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(appendFragmentRoute, async (ctx) => {
  const { fragmentId } = ctx.req.valid("param");
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
    const sourceKey = await resolveSourceKey(
      storageService,
      projectContext,
      sourceUuid,
      sourceType,
    );
    const fragment = await executeCommand(insertFragmentCommand, commandContext, {
      fragmentId,
      insertedBody,
      position: "append",
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    });
    if (sourceMode !== "cut") return ctx.json({ fragment, sourceCutFailed: false }, 200);
    const cutSuccess = await executeCommand(cutBodyCommand, commandContext, {
      sourceType,
      sourceId: sourceUuid,
      textToRemove: insertedBody,
    });
    return ctx.json({ fragment, sourceCutFailed: !cutSuccess }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(prependFragmentRoute, async (ctx) => {
  const { fragmentId } = ctx.req.valid("param");
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
    const sourceKey = await resolveSourceKey(
      storageService,
      projectContext,
      sourceUuid,
      sourceType,
    );
    const fragment = await executeCommand(insertFragmentCommand, commandContext, {
      fragmentId,
      insertedBody,
      position: "prepend",
      sourceType,
      sourceKey,
      sourceUuid,
      sourceMode,
      navigated,
    });
    if (sourceMode !== "cut") return ctx.json({ fragment, sourceCutFailed: false }, 200);
    const cutSuccess = await executeCommand(cutBodyCommand, commandContext, {
      sourceType,
      sourceId: sourceUuid,
      textToRemove: insertedBody,
    });
    return ctx.json({ fragment, sourceCutFailed: !cutSuccess }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(updateFragmentRoute, async (ctx) => {
  const { fragmentId } = ctx.req.valid("param");
  const rawUpdate = ctx.req.valid("json");

  let update = rawUpdate;
  if (rawUpdate.key !== undefined) {
    try {
      update = { ...rawUpdate, key: validateEntityKey(rawUpdate.key) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid key";
      return ctx.json({ error: "INVALID_KEY", message }, 400);
    }
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

    const existing = await storageService.fragments.read(projectContext, fragmentId);
    const source = classifyFragmentSource(update);
    const fragment = await executeCommand(updateFragmentCommand, commandContext, {
      existing,
      patch: update,
      source,
    });

    return ctx.json({ fragment, warnings: [] }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(discardFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };

    // Read the fragment key before discard for the log entry.
    const indexed = await storageService.fragments.read(projectContext, fragmentId);
    await executeCommand(discardFragmentCommand, commandContext, {
      fragmentId,
      fragmentKey: indexed.key,
    });
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(deleteFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };

    const indexed = await storageService.fragments.read(projectContext, fragmentId);
    await executeCommand(deleteFragmentCommand, commandContext, {
      fragmentId,
      fragmentKey: indexed.key,
    });
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(restoreFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };

    const indexed = await storageService.fragments.read(projectContext, fragmentId);
    await executeCommand(restoreFragmentCommand, commandContext, {
      fragmentId,
      fragmentKey: indexed.key,
    });
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

fragmentsRouter.openapi(getFragmentStatsRoute, (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    const stats = storageService.stats.getForFragment(projectContext, fragmentId);

    return ctx.json(
      {
        fragmentUuid: stats.fragmentUuid,
        wordCount: stats.wordCount,
        editCount: stats.editCount,
        voluntaryOpenCount: stats.voluntaryOpenCount,
        promptAcceptCount: stats.promptAcceptCount,
        avoidanceCount: stats.avoidanceCount,
        lastSurfacedAt: stats.lastSurfacedAt?.toISOString() ?? null,
      },
      200,
    );
  } catch (error) {
    return throwStorageError(error);
  }
});
