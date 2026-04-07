import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import type { Fragment, FragmentUUID, Pool } from "@maskor/shared";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import {
  FragmentSchema,
  FragmentCreateSchema,
  FragmentUUIDParamSchema,
  FragmentPoolQuerySchema,
} from "../schemas/fragment";
import { ErrorResponseSchema } from "../schemas/error";

const projectIdParamSchema = z.object({ projectId: z.uuid() });

export const fragmentsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listFragmentsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Fragments"],
  summary: "List all indexed fragments for a project",
  request: {
    params: projectIdParamSchema,
    query: FragmentPoolQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(FragmentSchema) } },
      description: "List of fragments",
    },
  },
});

const getFragmentRoute = createRoute({
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
  },
});

const createFragmentRoute = createRoute({
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
  },
});

const discardFragmentRoute = createRoute({
  method: "delete",
  path: "/{fragmentId}",
  tags: ["Fragments"],
  summary: "Discard a fragment (moves to the discarded pool)",
  request: { params: FragmentUUIDParamSchema },
  responses: {
    204: { description: "Fragment discarded" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
    },
  },
});

fragmentsRouter.openapi(listFragmentsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { pool } = ctx.req.valid("query");

    const fragments = pool
      ? await storageService.fragments.findByPool(projectContext, pool as Pool)
      : await storageService.fragments.readAll(projectContext);

    return ctx.json(fragments as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

fragmentsRouter.openapi(getFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");
    const fragment = await storageService.fragments.read(
      projectContext,
      fragmentId as FragmentUUID,
    );
    return ctx.json(fragment as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

fragmentsRouter.openapi(createFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { title, content, pool } = ctx.req.valid("json");

    const fragment: Fragment = {
      uuid: randomUUID() as FragmentUUID,
      title,
      content,
      pool: pool as Pool,
      version: 1,
      readyStatus: 0,
      notes: [],
      references: [],
      properties: {},
      contentHash: "", // TODO: compute a real hash (e.g. Bun.hash) once downstream consumers rely on this for change detection
      updatedAt: new Date(),
    };

    // NOTE: After write the index is stale until the next rebuild.
    await storageService.fragments.write(projectContext, fragment);
    return ctx.json(fragment as never, 201);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

fragmentsRouter.openapi(discardFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.valid("param");

    // NOTE: After discard the index is stale until the next rebuild.
    await storageService.fragments.discard(projectContext, fragmentId as FragmentUUID);
    return new Response(null, { status: 204 }) as never;
  } catch (error) {
    return handleStorageError(error) as never;
  }
});
