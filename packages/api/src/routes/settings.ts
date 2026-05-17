import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { createSettingsService, DEFAULT_CONFIG_DIRECTORY } from "@maskor/storage";
import type { AppVariables } from "../app";
import { SettingsResponseSchema } from "../schemas/settings";

export const settingsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const getSettingsRoute = createRoute({
  operationId: "getSettings",
  method: "get",
  path: "/",
  tags: ["Settings"],
  summary: "Get current settings",
  responses: {
    200: {
      content: { "application/json": { schema: SettingsResponseSchema } },
      description: "Current settings",
    },
  },
});

const settingsService = createSettingsService(DEFAULT_CONFIG_DIRECTORY);

settingsRouter.openapi(getSettingsRoute, async (ctx) => {
  const { settings } = await settingsService.readSettings();
  return ctx.json(settings, 200);
});
