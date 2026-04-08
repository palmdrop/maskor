import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { RebuildStatsSchema } from "../schemas/vault-index";
import { ErrorResponseSchema } from "../schemas/error";

const projectIdParamSchema = z.object({ projectId: z.uuid() });

export const vaultIndexRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const rebuildIndexRoute = createRoute({
  method: "post",
  path: "/rebuild",
  tags: ["Index"],
  summary: "Trigger a full vault index rebuild",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: RebuildStatsSchema } },
      description: "Rebuild complete",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

vaultIndexRouter.openapi(rebuildIndexRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const stats = await storageService.index.rebuild(projectContext);
    return ctx.json(stats, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
