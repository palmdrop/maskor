import { z } from "@hono/zod-openapi";

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "NOT_FOUND" }),
    message: z.string().openapi({ example: "Fragment not found" }),
    hint: z.string().optional().openapi({ example: "index_may_be_stale" }),
    reason: z.string().optional().openapi({ example: "name_conflict" }),
    // Present on a `constraint_cycle` shuffle conflict: the contributing
    // sequences and fragments of each detected ordering cycle.
    cycles: z
      .array(
        z.object({
          sequenceUuids: z.array(z.string()),
          fragmentUuids: z.array(z.string()),
        }),
      )
      .optional()
      .openapi({ description: "Constraint cycles that made a valid ordering impossible" }),
  })
  .openapi("ErrorResponse");
