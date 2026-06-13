import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { projectIdParamSchema } from "../schemas/shared";
import { ErrorResponseSchema } from "../schemas/error";
import { SplitPreviewBodySchema, SplitPreviewResultSchema } from "../schemas/split";
import { executeCommand, previewSplitCommand } from "../commands";
import type { CommandContext } from "../commands";

const commandContextFrom = (ctx: {
  get: (key: "storageService" | "projectContext" | "logger" | "correlationId") => unknown;
}): CommandContext => ({
  storageService: ctx.get("storageService") as CommandContext["storageService"],
  projectContext: ctx.get("projectContext") as CommandContext["projectContext"],
  actor: "user",
  logger: ctx.get("logger") as CommandContext["logger"],
  correlationId: ctx.get("correlationId") as CommandContext["correlationId"],
});

const splitPreviewRoute = createRoute({
  operationId: "previewSplitFragment",
  method: "post",
  path: "/preview",
  tags: ["Fragments"],
  summary: "Preview how a fragment would divide into pieces along a delimiter",
  description:
    "Read-derivation: runs the shared split engine over the fragment's body and returns a lean piece list (pieceIndex, key, excerpt) plus a count. Writes nothing. Piece 1 reports the original's existing key; pieces 2…N report deriveKey-derived keys.",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: SplitPreviewBodySchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SplitPreviewResultSchema } },
      description: "The pieces the split would produce, plus their count",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

export const splitRouter = new OpenAPIHono<{ Variables: AppVariables }>();

splitRouter.openapi(splitPreviewRoute, async (ctx) => {
  const { fragmentId, delimiter } = ctx.req.valid("json");

  try {
    const result = await executeCommand(
      previewSplitCommand,
      "split:preview",
      commandContextFrom(ctx),
      { fragmentId, delimiter },
    );
    return ctx.json(result, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
