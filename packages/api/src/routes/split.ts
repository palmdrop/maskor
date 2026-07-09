import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { projectIdParamSchema } from "../schemas/shared";
import { ErrorResponseSchema } from "../schemas/error";
import { HTTPException } from "hono/http-exception";
import {
  SplitPreviewBodySchema,
  SplitPreviewResultSchema,
  SplitBodySchema,
  SplitResultSchema,
} from "../schemas/split";
import {
  executeCommand,
  previewSplitCommand,
  splitFragmentCommand,
  SplitNoOpError,
  SplitKeyConflictError,
  SplitKeyInvalidError,
} from "../commands";
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

const splitRoute = createRoute({
  operationId: "splitFragment",
  method: "post",
  path: "/",
  tags: ["Fragments"],
  summary: "Split a fragment into multiple fragments along a delimiter",
  description:
    "Identity-preserving split: the original is truncated to piece 1 (keeping uuid, key, aspects, readiness, references) and pieces 2…N become new fragments inheriting its aspects + references, inserted immediately after it in every sequence it is placed in. Records a single non-undoable fragment:split action-log entry.",
  request: {
    params: projectIdParamSchema,
    body: { content: { "application/json": { schema: SplitBodySchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SplitResultSchema } },
      description:
        "The split result: source uuid + the created pieces, plus any non-fatal follow-up warnings (the split itself committed)",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The delimiter yields a single piece — nothing to split",
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

splitRouter.openapi(splitRoute, async (ctx) => {
  const { fragmentId, delimiter, pieceKeys } = ctx.req.valid("json");

  try {
    const result = await executeCommand(
      splitFragmentCommand,
      "fragment:split",
      commandContextFrom(ctx),
      {
        fragmentId,
        delimiter,
        pieceKeys,
      },
    );
    return ctx.json(result, 200);
  } catch (error) {
    if (error instanceof SplitNoOpError) {
      throw new HTTPException(400, {
        res: new Response(JSON.stringify({ error: "SPLIT_NO_OP", message: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      });
    }
    if (error instanceof SplitKeyConflictError) {
      throw new HTTPException(400, {
        res: new Response(JSON.stringify({ error: "SPLIT_KEY_CONFLICT", message: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      });
    }
    if (error instanceof SplitKeyInvalidError) {
      throw new HTTPException(400, {
        res: new Response(JSON.stringify({ error: "SPLIT_KEY_INVALID", message: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      });
    }
    return throwStorageError(error);
  }
});
