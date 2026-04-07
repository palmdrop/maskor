import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ReferenceUUID } from "@maskor/shared";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import { ReferenceSchema, ReferenceUUIDParamSchema } from "../schemas/reference";
import { ErrorResponseSchema } from "../schemas/error";

const projectIdParamSchema = z.object({ projectId: z.uuid() });

export const referencesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listReferencesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["References"],
  summary: "List all indexed references for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ReferenceSchema) } },
      description: "List of references",
    },
  },
});

const getReferenceRoute = createRoute({
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
  },
});

referencesRouter.openapi(listReferencesRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const references = await storageService.references.readAll(projectContext);
    return ctx.json(references as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

referencesRouter.openapi(getReferenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { referenceId } = ctx.req.valid("param");
    const reference = await storageService.references.read(
      projectContext,
      referenceId as ReferenceUUID,
    );
    return ctx.json(reference as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});
