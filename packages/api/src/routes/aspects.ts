import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AspectUUID } from "@maskor/shared";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import { AspectSchema, AspectUUIDParamSchema } from "../schemas/aspect";
import { ErrorResponseSchema } from "../schemas/error";

const projectIdParamSchema = z.object({ projectId: z.uuid() });

export const aspectsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listAspectsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Aspects"],
  summary: "List all indexed aspects for a project",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(AspectSchema) } },
      description: "List of aspects",
    },
  },
});

const getAspectRoute = createRoute({
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
  },
});

aspectsRouter.openapi(listAspectsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const aspects = await storageService.aspects.readAll(projectContext);
    return ctx.json(aspects as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

aspectsRouter.openapi(getAspectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { aspectId } = ctx.req.valid("param");
    const aspect = await storageService.aspects.read(projectContext, aspectId as AspectUUID);
    return ctx.json(aspect as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});
