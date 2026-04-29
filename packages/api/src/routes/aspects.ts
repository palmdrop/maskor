import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import type { Aspect, Arc } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  AspectSchema,
  IndexedAspectSchema,
  AspectUUIDParamSchema,
  AspectCreateSchema,
  AspectUpdateSchema,
} from "../schemas/aspect";
import { ArcSchema, ArcCreateSchema, ArcAspectParamSchema } from "../schemas/arc";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

export const aspectsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listAspectsRoute = createRoute({
  operationId: "listAspects",
  method: "get",
  path: "/",
  tags: ["Aspects"],
  summary: "List all indexed aspects for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(IndexedAspectSchema) } },
      description: "List of aspects",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getAspectRoute = createRoute({
  operationId: "getAspect",
  method: "get",
  path: "/{aspectId}",
  tags: ["Aspects"],
  summary: "Get a single aspect by UUID",
  request: { params: AspectUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: AspectSchema } },
      description: "Aspect",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Aspect not found",
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

const createAspectRoute = createRoute({
  operationId: "createAspect",
  method: "post",
  path: "/",
  tags: ["Aspects"],
  summary: "Create a new aspect in the vault",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: AspectCreateSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: AspectSchema } },
      description: "Aspect created",
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

const deleteAspectRoute = createRoute({
  operationId: "deleteAspect",
  method: "delete",
  path: "/{aspectId}",
  tags: ["Aspects"],
  summary: "Delete an aspect from the vault",
  request: { params: AspectUUIDParamSchema },
  responses: {
    204: { description: "Aspect deleted" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Aspect not found",
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

const updateAspectRoute = createRoute({
  operationId: "updateAspect",
  method: "patch",
  path: "/{aspectId}",
  tags: ["Aspects"],
  summary: "Update an aspect's description, category, or notes",
  request: {
    params: AspectUUIDParamSchema,
    body: { content: { "application/json": { schema: AspectUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AspectSchema } },
      description: "Aspect updated",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Aspect not found",
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

aspectsRouter.openapi(listAspectsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const aspects = await storageService.aspects.readAll(projectContext);
    return ctx.json(aspects, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

aspectsRouter.openapi(getAspectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");
    const aspect = await storageService.aspects.read(projectContext, aspectId);
    return ctx.json(aspect, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

aspectsRouter.openapi(createAspectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { key, category, description, notes } = ctx.req.valid("json");

    const aspect: Aspect = {
      uuid: randomUUID(),
      key,
      category,
      description,
      notes,
    };

    await storageService.aspects.write(projectContext, aspect);
    return ctx.json(aspect, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

aspectsRouter.openapi(deleteAspectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");

    await storageService.aspects.delete(projectContext, aspectId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});

aspectsRouter.openapi(updateAspectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");
    const patch = ctx.req.valid("json");

    const updated = await storageService.aspects.update(projectContext, aspectId, patch);
    return ctx.json(updated, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

// Arc routes — nested under /:aspectId/arc

const getArcRoute = createRoute({
  operationId: "getArc",
  method: "get",
  path: "/{aspectId}/arc",
  tags: ["Aspects"],
  summary: "Get the arc for an aspect",
  request: { params: ArcAspectParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ArcSchema } },
      description: "Arc",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Arc or aspect not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const putArcRoute = createRoute({
  operationId: "putArc",
  method: "put",
  path: "/{aspectId}/arc",
  tags: ["Aspects"],
  summary: "Create or replace the arc for an aspect",
  request: {
    params: ArcAspectParamSchema,
    body: { content: { "application/json": { schema: ArcCreateSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ArcSchema } },
      description: "Arc saved",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Aspect not found",
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

const deleteArcRoute = createRoute({
  operationId: "deleteArc",
  method: "delete",
  path: "/{aspectId}/arc",
  tags: ["Aspects"],
  summary: "Delete the arc for an aspect",
  request: { params: ArcAspectParamSchema },
  responses: {
    204: { description: "Arc deleted" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Aspect not found",
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

aspectsRouter.openapi(getArcRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");

    const aspect = await storageService.aspects.read(projectContext, aspectId);
    const arc = await storageService.arcs.read(projectContext, aspect.key);

    if (!arc) {
      return ctx.json({ error: "NOT_FOUND", message: "No arc defined for this aspect" }, 404);
    }
    return ctx.json(arc, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

aspectsRouter.openapi(putArcRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");
    const { points } = ctx.req.valid("json");

    const aspect = await storageService.aspects.read(projectContext, aspectId);
    const existing = await storageService.arcs.read(projectContext, aspect.key);

    const arc: Arc = {
      uuid: existing?.uuid ?? randomUUID(),
      aspectKey: aspect.key,
      points,
    };

    await storageService.arcs.write(projectContext, arc);
    return ctx.json(arc, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

aspectsRouter.openapi(deleteArcRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");

    const aspect = await storageService.aspects.read(projectContext, aspectId);
    await storageService.arcs.delete(projectContext, aspect.key);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
