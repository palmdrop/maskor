import { z } from "@hono/zod-openapi";

export const SettingsResponseSchema = z
  .object({
    maskorManagedRoot: z.string().openapi({ example: "/Users/me/Documents/Maskor" }),
    warning: z
      .string()
      .optional()
      .openapi({ example: "Settings file could not be parsed; using defaults." }),
  })
  .openapi("SettingsResponse");

export const SettingsPatchSchema = z
  .object({
    maskorManagedRoot: z.string().min(1).openapi({ example: "/Users/me/Documents/Maskor" }),
  })
  .openapi("SettingsPatch");
