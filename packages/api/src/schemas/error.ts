import { z } from "@hono/zod-openapi";

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "NOT_FOUND" }),
    message: z.string().openapi({ example: "Fragment not found" }),
    hint: z.string().optional().openapi({ example: "index_may_be_stale" }),
    reason: z.string().optional().openapi({ example: "name_conflict" }),
  })
  .openapi("ErrorResponse");
