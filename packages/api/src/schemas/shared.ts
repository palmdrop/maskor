import { z } from "@hono/zod-openapi";

export const projectIdParamSchema = z.object({ projectId: z.uuid() });
