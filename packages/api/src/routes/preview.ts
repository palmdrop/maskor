import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { assembleSequence } from "@maskor/exporter";
import type { Fragment } from "@maskor/shared";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { AssembledSequenceSchema, PreviewSequenceUUIDParamSchema } from "../schemas/preview";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";

export const previewRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const getAssembledSequenceRoute = createRoute({
  operationId: "getAssembledSequence",
  method: "get",
  path: "/{sequenceId}",
  tags: ["Preview"],
  summary: "Assemble a sequence into ordered prose payload",
  request: { params: PreviewSequenceUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: AssembledSequenceSchema } },
      description: "Assembled sequence",
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

const getMainAssembledSequenceRoute = createRoute({
  operationId: "getMainAssembledSequence",
  method: "get",
  path: "/",
  tags: ["Preview"],
  summary: "Assemble the main sequence into ordered prose payload",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: AssembledSequenceSchema } },
      description: "Assembled main sequence",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "No main sequence or project not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

async function buildAssembledSequence(
  storageService: AppVariables["storageService"],
  projectContext: NonNullable<AppVariables["projectContext"]>,
  sequenceUuid: string,
) {
  const sequence = await storageService.sequences.read(projectContext, sequenceUuid);

  const allFragmentUuids = sequence.sections.flatMap((section) =>
    section.fragments.map((pos) => pos.fragmentUuid),
  );
  const uniqueUuids = [...new Set(allFragmentUuids)];

  const fragmentResults = await Promise.allSettled(
    uniqueUuids.map((uuid) => storageService.fragments.read(projectContext, uuid)),
  );

  const fragments: Fragment[] = fragmentResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  return assembleSequence(sequence, fragments);
}

previewRouter.openapi(getAssembledSequenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");

    const assembled = await buildAssembledSequence(storageService, projectContext, sequenceId);
    return ctx.json(assembled, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

previewRouter.openapi(getMainAssembledSequenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;

    const mainSequence = await storageService.sequences.getMain(projectContext);
    if (!mainSequence) {
      return ctx.json({ error: "NOT_FOUND", message: "No main sequence found" }, 404);
    }

    const assembled = await buildAssembledSequence(
      storageService,
      projectContext,
      mainSequence.uuid,
    );
    return ctx.json(assembled, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});
