import { z } from "@hono/zod-openapi";
import { FragmentSchema } from "./fragment";

export const SuggestionNextResponseSchema = z
  .object({
    fragment: FragmentSchema.nullable(),
    avoidanceCount: z.number().int().nonnegative(),
  })
  .openapi("SuggestionNextResponse");

export const SuggestionNextQuerySchema = z.object({
  exclude: z.uuid().optional().openapi({
    description: "UUID of the currently displayed fragment to exclude from selection",
    example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890",
  }),
});

export const SuggestionVisitParamSchema = z.object({
  projectId: z.uuid(),
  fragmentId: z
    .uuid()
    .openapi({ example: "f1a2b3c4-d5e6-7890-abcd-ef1234567890" }),
});
