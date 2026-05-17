import { z } from "@hono/zod-openapi";

export const SettingsResponseSchema = z
  .object({
    maskorManagedRoot: z.string().openapi({ example: "/Users/me/Documents/Maskor" }),
  })
  .openapi("SettingsResponse");
