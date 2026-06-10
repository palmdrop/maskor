import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { ExportSequenceParamSchema, ExportSequenceBodySchema } from "../schemas/export";
import { ErrorResponseSchema } from "../schemas/error";
import { exportSequenceCommand, executeCommand, type CommandContext } from "../commands";

export const exportRouter = new OpenAPIHono<{ Variables: AppVariables }>();

// Declared separately for OpenAPI documentation — the actual handler uses
// app.post() because hono/zod-openapi's return-type narrowing does not support
// binary (octet-stream) responses.
const exportSequenceRoute = createRoute({
  operationId: "exportSequence",
  method: "post",
  path: "/{sequenceId}",
  tags: ["Export"],
  summary: "Export a sequence to a file (md, txt, or docx)",
  request: {
    params: ExportSequenceParamSchema,
    body: {
      content: { "application/json": { schema: ExportSequenceBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/octet-stream": {
          schema: z.string().openapi({
            format: "binary",
            description: "The assembled file bytes",
          }),
        },
      },
      description: "Assembled file download",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or project not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

// Register the route definition for OpenAPI doc generation, then handle with
// a plain post() handler that can return a raw Response with binary bytes.
exportRouter.openAPIRegistry.registerPath(exportSequenceRoute);

exportRouter.post("/:sequenceId", async (context) => {
  try {
    const storageService = context.get("storageService");
    const projectContext = context.get("projectContext")!;

    const sequenceIdParam = context.req.param("sequenceId");
    const paramResult = ExportSequenceParamSchema.safeParse({
      projectId: projectContext.projectUUID,
      sequenceId: sequenceIdParam,
    });
    if (!paramResult.success) {
      return context.json({ error: "INVALID_REQUEST", message: "Invalid sequenceId" }, 400);
    }

    const body: unknown = await context.req.json();
    const bodyResult = ExportSequenceBodySchema.safeParse(body);
    if (!bodyResult.success) {
      return context.json({ error: "INVALID_REQUEST", message: bodyResult.error.message }, 400);
    }

    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: context.get("logger"),
      correlationId: context.get("correlationId"),
    };

    const result = await executeCommand(exportSequenceCommand, "sequence:export", commandContext, {
      sequenceId: paramResult.data.sequenceId,
      format: bodyResult.data.format,
    });

    return new Response(result.bytes, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": String(result.bytes.byteLength),
      },
    });
  } catch (error) {
    return throwStorageError(error);
  }
});
