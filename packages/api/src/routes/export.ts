import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { markerIdSet } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  ExportSequenceParamSchema,
  ExportSequenceBodySchema,
  ExportAnnotationSummarySchema,
} from "../schemas/export";
import { ErrorResponseSchema } from "../schemas/error";
import { exportSequenceCommand, executeCommand, type CommandContext } from "../commands";

export const exportRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const getExportAnnotationSummaryRoute = createRoute({
  operationId: "getExportAnnotationSummary",
  method: "get",
  path: "/{sequenceId}/annotation-summary",
  tags: ["Export"],
  summary: "Preflight counts of the annotations an export of this sequence would add",
  request: { params: ExportSequenceParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ExportAnnotationSummarySchema } },
      description: "Annotation counts",
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

// Read-only preflight for the Export dialog. Counts mirror what the export
// assembly would emit: distinct resolvable references (deduped to one footnote
// definition each), bound Margin comments (anchor marker present in the body),
// fragments with notes, and orphaned comments (skipped with a warning on export).
exportRouter.openapi(getExportAnnotationSummaryRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");

    const sequence = await storageService.sequences.read(projectContext, sequenceId);
    const uniqueUuids = [
      ...new Set(
        sequence.sections.flatMap((section) =>
          section.fragments.map((position) => position.fragmentUuid),
        ),
      ),
    ];
    const fragmentResults = await Promise.allSettled(
      uniqueUuids.map((uuid) => storageService.fragments.read(projectContext, uuid)),
    );
    const fragments = fragmentResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    // Resolvable reference keys — a dangling attachment is skipped on export, so
    // it is not counted here either.
    const indexedReferences = await storageService.references.readAll(projectContext);
    const knownReferenceKeys = new Set(indexedReferences.map((indexed) => indexed.key));
    const attachedReferenceKeys = new Set(
      fragments.flatMap((fragment) =>
        fragment.references.filter((key) => knownReferenceKeys.has(key)),
      ),
    );

    let commentCount = 0;
    let noteCount = 0;
    let orphanedCommentCount = 0;
    for (const fragment of fragments) {
      const margin = await storageService.margins.read(projectContext, fragment.uuid);
      if (!margin) continue;
      if (margin.notes.trim().length > 0) noteCount += 1;
      const presentMarkerIds = markerIdSet(fragment.content);
      for (const comment of margin.comments) {
        if (presentMarkerIds.has(comment.markerId)) commentCount += 1;
        else orphanedCommentCount += 1;
      }
    }

    return ctx.json(
      {
        referenceCount: attachedReferenceKeys.size,
        commentCount,
        noteCount,
        orphanedCommentCount,
      },
      200,
    );
  } catch (error) {
    return throwStorageError(error);
  }
});

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
      includeReferences: bodyResult.data.includeReferences,
      includeMarginAnnotations: bodyResult.data.includeMarginAnnotations,
      showTitles: bodyResult.data.showTitles,
      showSectionHeadings: bodyResult.data.showSectionHeadings,
      separator: bodyResult.data.separator,
    });

    const headers: Record<string, string> = {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Length": String(result.bytes.byteLength),
    };

    // Surface orphaned-comment warnings out-of-band (the body stays the file
    // download): JSON, URI-encoded, only when non-empty.
    if (result.warnings.length > 0) {
      headers["X-Maskor-Export-Warnings"] = encodeURIComponent(JSON.stringify(result.warnings));
    }

    return new Response(result.bytes, {
      status: 200,
      headers,
    });
  } catch (error) {
    return throwStorageError(error);
  }
});
