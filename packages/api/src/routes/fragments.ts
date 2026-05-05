import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import type { Fragment } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { validateEntityKey } from "@maskor/shared";
import {
  FragmentSchema,
  FragmentUpdateResponseSchema,
  IndexedFragmentSchema,
  FragmentCreateSchema,
  FragmentUpdateSchema,
  FragmentUUIDParamSchema,
} from "../schemas/fragment";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

export const fragmentsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

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
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;

    const draft: Fragment = {
      uuid: randomUUID(),
      key,
      content,
      isDiscarded: false,
      readyStatus: 0,
      notes: [],
      references: [],
      properties: {},
      contentHash: "",
      updatedAt: new Date(),
    };

    const fragment = await storageService.fragments.write(projectContext, draft);
    return ctx.json(fragment, 201);
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

    const existing = await storageService.fragments.read(projectContext, fragmentId);
    const fragment = await storageService.fragments.write(projectContext, {
      ...existing,
      ...update,
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

    // NOTE: After discard the index is stale until the next rebuild.
    await storageService.fragments.discard(projectContext, fragmentId);
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

    await storageService.fragments.restore(projectContext, fragmentId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
