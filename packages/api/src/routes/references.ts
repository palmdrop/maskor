import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  ReferenceSchema,
  IndexedReferenceSchema,
  ReferenceUUIDParamSchema,
} from "../schemas/reference";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

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
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
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
