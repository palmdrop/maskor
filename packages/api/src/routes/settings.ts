import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { SettingsService } from "@maskor/storage";
import type { AppVariables } from "../app";
import { SettingsResponseSchema, SettingsPatchSchema } from "../schemas/settings";
import { ErrorResponseSchema } from "../schemas/error";
import { executeGlobalCommand, createPatchSettingsCommand } from "../commands";
import type { GlobalCommandContext } from "../commands";

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

const patchSettingsRoute = createRoute({
  operationId: "patchSettings",
  method: "patch",
  path: "/",
  tags: ["Settings"],
  summary: "Update settings",
  request: {
    body: { content: { "application/json": { schema: SettingsPatchSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SettingsResponseSchema } },
      description: "Updated settings",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
  },
});

export const createSettingsRouter = (settingsService: SettingsService) => {
  const router = new OpenAPIHono<{ Variables: AppVariables }>();

  router.openapi(getSettingsRoute, async (ctx) => {
    const { settings, warning } = await settingsService.readSettings();
    return ctx.json({ ...settings, ...(warning !== undefined ? { warning } : {}) }, 200);
  });

  router.openapi(patchSettingsRoute, async (ctx) => {
    const patch = ctx.req.valid("json");
    const commandCtx: GlobalCommandContext = {
      storageService: ctx.get("storageService"),
      actor: "user",
      logger: ctx.get("logger"),
    };
    const result = await executeGlobalCommand(
      createPatchSettingsCommand(settingsService),
      commandCtx,
      patch,
    );
    return ctx.json(result, 200);
  });

  return router;
};
