import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { assembleSequence } from "@maskor/exporter";
import type { Fragment } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  PreviewResultSchema,
  PreviewSequenceQuerySchema,
  PreviewSequenceUUIDParamSchema,
} from "../schemas/preview";
import { ErrorResponseSchema } from "../schemas/error";

export const previewRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const getAssembledSequenceRoute = createRoute({
  operationId: "getAssembledSequence",
  method: "get",
  path: "/{sequenceId}",
  tags: ["Preview"],
  summary: "Assemble a sequence into a markdown string plus lean nav payload",
  request: {
    params: PreviewSequenceUUIDParamSchema,
    query: PreviewSequenceQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: PreviewResultSchema } },
      description: "Assembled markdown + navigation sections",
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

previewRouter.openapi(getAssembledSequenceRoute, async (context) => {
  try {
    const storageService = context.get("storageService");
    const projectContext = context.get("projectContext")!;
    const { sequenceId } = context.req.valid("param");
    const { showTitles, showSectionHeadings, separator } = context.req.valid("query");

    const sequence = await storageService.sequences.read(projectContext, sequenceId);

    const allFragmentUuids = sequence.sections.flatMap((section) =>
      section.fragments.map((position) => position.fragmentUuid),
    );
    const uniqueUuids = [...new Set(allFragmentUuids)];

    const fragmentResults = await Promise.allSettled(
      uniqueUuids.map((uuid) => storageService.fragments.read(projectContext, uuid)),
    );

    const fragments: Fragment[] = fragmentResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const assembled = assembleSequence(sequence, fragments, {
      showTitles,
      showSectionHeadings,
      separator,
      includeAnchors: true,
    });

    return context.json(assembled, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
