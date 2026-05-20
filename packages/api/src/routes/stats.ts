import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { ProjectStatsSchema } from "../schemas/stats";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

export const statsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const getProjectStatsRoute = createRoute({
  operationId: "getProjectStats",
  method: "get",
  path: "/",
  tags: ["Stats"],
  summary: "Get aggregate stats for a project",
  request: {
    params: projectIdParamSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectStatsSchema } },
      description: "Project stats",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

statsRouter.openapi(getProjectStatsRoute, (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const stats = storageService.stats.getForProject(projectContext);

    return ctx.json(
      {
        global: {
          ...stats.global,
          readinessHistogram: stats.global.readinessHistogram,
        },
        fragments: stats.fragments.map((fragment) => ({
          ...fragment,
          updatedAt: fragment.updatedAt.toISOString(),
        })),
      },
      200,
    );
  } catch (error) {
    return throwStorageError(error);
  }
});
