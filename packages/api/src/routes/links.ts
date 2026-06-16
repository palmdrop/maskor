import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { BacklinksQuerySchema, BacklinkListSchema } from "../schemas/links";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

export const linksRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listBacklinksRoute = createRoute({
  operationId: "listBacklinks",
  method: "get",
  path: "/backlinks",
  tags: ["Links"],
  summary: "List every body that links to a target entity",
  request: { params: projectIdParamSchema, query: BacklinksQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: BacklinkListSchema } },
      description: "Backlinks for the target entity",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

linksRouter.openapi(listBacklinksRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { targetType, targetKey } = ctx.req.valid("query");
    const backlinks = await storageService.links.backlinks(projectContext, targetType, targetKey);
    return ctx.json(backlinks, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
