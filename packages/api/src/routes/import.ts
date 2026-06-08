import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { MammothConverter } from "@maskor/importer";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { projectIdParamSchema } from "../schemas/shared";
import { ErrorResponseSchema } from "../schemas/error";
import { ImportBodySchema, ImportOptionsSchema, ImportResultSchema } from "../schemas/import";
import type { ImportOptions } from "../schemas/import";
import { createImportCommand, executeCommand, type ImportInput } from "../commands";
import type { CommandContext } from "../commands";

const importRoute = createRoute({
  operationId: "importFragments",
  method: "post",
  path: "/",
  tags: ["Fragments"],
  summary: "Import a .md, .txt, or .docx file as fragments",
  request: {
    params: projectIdParamSchema,
    body: {
      content: {
        "multipart/form-data": {
          schema: ImportBodySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ImportResultSchema } },
      description: "Import completed — check errors[] for per-piece failures",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid options payload or missing fields",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

export const importRouter = new OpenAPIHono<{ Variables: AppVariables }>();

importRouter.openapi(importRoute, async (ctx) => {
  const { projectId } = ctx.req.valid("param");
  const form = ctx.req.valid("form");

  const file: unknown = form.file;
  const optionsString: unknown = form.options;

  if (!(file instanceof File)) {
    return ctx.json({ error: "INVALID_REQUEST", message: "file field must be a file upload" }, 400);
  }

  if (typeof optionsString !== "string") {
    return ctx.json({ error: "INVALID_REQUEST", message: "options field must be a string" }, 400);
  }

  let parsedOptions: ImportOptions;
  try {
    const rawOptions: unknown = JSON.parse(optionsString);
    const result = ImportOptionsSchema.safeParse(rawOptions);
    if (!result.success) {
      return ctx.json({ error: "INVALID_OPTIONS", message: result.error.message }, 400);
    }
    parsedOptions = result.data;
  } catch {
    return ctx.json({ error: "INVALID_OPTIONS", message: "options must be valid JSON" }, 400);
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const converter = new MammothConverter();
  const command = createImportCommand(converter);

  const commandContext: CommandContext = {
    storageService: ctx.get("storageService"),
    projectContext: ctx.get("projectContext")!,
    actor: "user",
    correlationId: ctx.get("correlationId"),
    logger: ctx.get("logger"),
  };

  let input: ImportInput;
  if (parsedOptions.format === "plaintext") {
    input = {
      projectId,
      file: fileBytes,
      sourceFileName: file.name,
      format: "plaintext",
      delimiter: parsedOptions.delimiter,
    };
  } else {
    input = {
      projectId,
      file: fileBytes,
      sourceFileName: file.name,
      format: parsedOptions.format,
      headingLevel: parsedOptions.headingLevel,
    };
  }

  try {
    const result = await executeCommand(command, "fragment:import", commandContext, input);
    return ctx.json(result, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
