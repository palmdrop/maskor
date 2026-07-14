import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { computeViolations, detectCycles } from "@maskor/sequencer";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  SequenceSchema,
  SequenceUUIDParamSchema,
  SequenceFragmentParamSchema,
  SectionUUIDParamSchema,
  SequenceCreateSchema,
  SequenceUpdateSchema,
  FragmentPositionCreateSchema,
  FragmentPositionMoveSchema,
  SectionCreateSchema,
  SectionRenameSchema,
  SectionReorderSchema,
  FragmentsGroupSchema,
  FragmentsMoveSchema,
  SectionSplitSchema,
  SequenceCloneSchema,
  SequenceInsertSchema,
  SequenceGenerateSchema,
  SequenceBundledResponseSchema,
  SequenceContentsResponseSchema,
} from "../schemas/sequence";
import { ErrorResponseSchema } from "../schemas/error";
import { projectIdParamSchema } from "../schemas/shared";
import {
  executeCommand,
  ensureMainSequenceCommand,
  createSequenceCommand,
  updateSequenceCommand,
  deleteSequenceCommand,
  designateSequenceMainCommand,
  createSectionCommand,
  renameSectionCommand,
  deleteSectionCommand,
  moveSectionCommand,
  placeFragmentCommand,
  moveFragmentCommand,
  unplaceFragmentCommand,
  groupFragmentsCommand,
  moveFragmentsCommand,
  splitSectionCommand,
  mergeSectionCommand,
  cloneSequenceCommand,
  insertSequenceCommand,
  generateShuffleSequenceCommand,
  SequenceNameInvalidError,
} from "../commands";
import type { CommandContext } from "../commands";
import type { StorageService, ProjectContext } from "@maskor/storage";

export const sequencesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

// Maps a command-level SequenceNameInvalidError (empty / whitespace-only name,
// which slips past the route schema's `min(1)`) to a 400 before falling through
// to the shared storage-error mapping. Used by the create and update handlers.
const throwSequenceNameOrStorageError = (error: unknown): never => {
  if (error instanceof SequenceNameInvalidError) {
    throw new HTTPException(400, {
      res: new Response(
        JSON.stringify({ error: "SEQUENCE_NAME_INVALID", message: error.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    });
  }
  return throwStorageError(error);
};

async function buildBundledResponse(
  storageService: StorageService,
  projectContext: ProjectContext,
) {
  const allSequences = await storageService.sequences.readAll(projectContext);
  const main = allSequences.find((s) => s.isMain) ?? null;
  // Only active non-main sequences are consumed as ordering constraints.
  // Inactive sequences (e.g. import-sequences by default) are excluded.
  const secondaries = allSequences.filter((s) => !s.isMain && s.active);
  const cycles = detectCycles(secondaries);
  const violations = main ? computeViolations(main, secondaries) : [];
  return { sequences: allSequences, violations, cycles };
}

const listSequencesRoute = createRoute({
  operationId: "listSequences",
  method: "get",
  path: "/",
  tags: ["Sequences"],
  summary: "List all sequences for a project with current violations and cycles",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Sequences bundle",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getMainSequenceRoute = createRoute({
  operationId: "getMainSequence",
  method: "get",
  path: "/main",
  tags: ["Sequences"],
  summary: "Get the main sequence (auto-creates if none exists)",
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceSchema } },
      description: "Main sequence",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getSequenceRoute = createRoute({
  operationId: "getSequence",
  method: "get",
  path: "/{sequenceId}",
  tags: ["Sequences"],
  summary: "Get a sequence by UUID (full)",
  request: { params: SequenceUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceSchema } },
      description: "Sequence",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getSequenceContentsRoute = createRoute({
  operationId: "getSequenceContents",
  method: "get",
  path: "/{sequenceId}/contents",
  tags: ["Sequences"],
  summary: "Get per-fragment markdown content for a sequence (placed, ordered) plus the pool",
  request: { params: SequenceUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceContentsResponseSchema } },
      description: "Ordered placed-fragment content and pool-fragment content",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const createSequenceRoute = createRoute({
  operationId: "createSequence",
  method: "post",
  path: "/",
  tags: ["Sequences"],
  summary: "Create a named sequence",
  request: {
    params: projectIdParamSchema,
    body: {
      content: { "application/json": { schema: SequenceCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Sequence created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid sequence name",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Name conflict or main conflict",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const updateSequenceRoute = createRoute({
  operationId: "updateSequence",
  method: "patch",
  path: "/{sequenceId}",
  tags: ["Sequences"],
  summary: "Rename or set a sequence as main",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SequenceUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid sequence name",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Name conflict",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteSequenceRoute = createRoute({
  operationId: "deleteSequence",
  method: "delete",
  path: "/{sequenceId}",
  tags: ["Sequences"],
  summary: "Delete a sequence (refuses if it is main)",
  request: { params: SequenceUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Sequence deleted, bundle of remaining sequences",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Cannot delete main sequence",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const designateSequenceMainRoute = createRoute({
  operationId: "designateSequenceMain",
  method: "post",
  path: "/{sequenceId}/designate-main",
  tags: ["Sequences"],
  summary: "Make a secondary sequence the main sequence",
  request: { params: SequenceUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const placeFragmentRoute = createRoute({
  operationId: "placeFragment",
  method: "post",
  path: "/{sequenceId}/positions",
  tags: ["Sequences"],
  summary: "Place a fragment into a position in the sequence",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: FragmentPositionCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or section not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Fragment already placed",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const moveFragmentRoute = createRoute({
  operationId: "moveFragment",
  method: "patch",
  path: "/{sequenceId}/positions/{fragmentUuid}",
  tags: ["Sequences"],
  summary: "Move an already-placed fragment to a new position",
  request: {
    params: SequenceFragmentParamSchema,
    body: {
      content: { "application/json": { schema: FragmentPositionMoveSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const createSectionRoute = createRoute({
  operationId: "createSection",
  method: "post",
  path: "/{sequenceId}/sections",
  tags: ["Sequences"],
  summary: "Append a new section to a sequence",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SectionCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const renameSectionRoute = createRoute({
  operationId: "renameSection",
  method: "patch",
  path: "/{sequenceId}/sections/{sectionId}",
  tags: ["Sequences"],
  summary: "Rename a section within a sequence",
  request: {
    params: SectionUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SectionRenameSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or section not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const reorderSectionRoute = createRoute({
  operationId: "reorderSection",
  method: "patch",
  path: "/{sequenceId}/sections/{sectionId}/position",
  tags: ["Sequences"],
  summary: "Move a section to a new position within its sequence",
  request: {
    params: SectionUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SectionReorderSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or section not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteSectionRoute = createRoute({
  operationId: "deleteSection",
  method: "delete",
  path: "/{sequenceId}/sections/{sectionId}",
  tags: ["Sequences"],
  summary: "Delete a section; its fragments return to the sequence pool",
  request: { params: SectionUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or section not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Cannot delete the last section",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const unplaceFragmentRoute = createRoute({
  operationId: "unplaceFragment",
  method: "delete",
  path: "/{sequenceId}/positions/{fragmentUuid}",
  tags: ["Sequences"],
  summary: "Remove a fragment from the sequence (return it to the pool)",
  request: { params: SequenceFragmentParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const groupFragmentsRoute = createRoute({
  operationId: "groupFragments",
  method: "post",
  path: "/{sequenceId}/group-fragments",
  tags: ["Sequences"],
  summary: "Group a set of placed fragments into a new section",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: FragmentsGroupSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const moveFragmentsRoute = createRoute({
  operationId: "moveFragments",
  method: "post",
  path: "/{sequenceId}/move-fragments",
  tags: ["Sequences"],
  summary: "Move a set of placed fragments into an existing section as a block",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: FragmentsMoveSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence, section, or fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const splitSectionRoute = createRoute({
  operationId: "splitSection",
  method: "post",
  path: "/{sequenceId}/split-section",
  tags: ["Sequences"],
  summary: "Split a section at a marked fragment, inserting a new section boundary",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SectionSplitSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or fragment not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const mergeSectionRoute = createRoute({
  operationId: "mergeSection",
  method: "post",
  path: "/{sequenceId}/sections/{sectionId}/merge-next",
  tags: ["Sequences"],
  summary: "Merge a section into the one immediately below it (drops the boundary)",
  request: { params: SectionUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence or section not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Section has no following section to merge with",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const cloneSequenceRoute = createRoute({
  operationId: "cloneSequence",
  method: "post",
  path: "/{sequenceId}/clone",
  tags: ["Sequences"],
  summary: "Clone a sequence into a fresh independent copy",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SequenceCloneSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Sequence cloned, bundle of all sequences",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Sequence not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const insertSequenceRoute = createRoute({
  operationId: "insertSequence",
  method: "post",
  path: "/{sequenceId}/insert-sequence",
  tags: ["Sequences"],
  summary: "Insert another sequence's sections into this one at a section index",
  request: {
    params: SequenceUUIDParamSchema,
    body: {
      content: { "application/json": { schema: SequenceInsertSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Updated sequence bundle",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Target or source sequence not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const generateSequenceRoute = createRoute({
  operationId: "generateSequence",
  method: "post",
  path: "/generate",
  tags: ["Sequences"],
  summary: "Generate a new sequence by shuffling fragments under ordering constraints",
  request: {
    params: projectIdParamSchema,
    body: {
      content: { "application/json": { schema: SequenceGenerateSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SequenceBundledResponseSchema } },
      description: "Sequence generated, bundle of all sequences",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "A chosen constraint sequence was not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The chosen constraints contradict each other (constraint_cycle)",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

// --- handlers ---

sequencesRouter.openapi(listSequencesRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(getMainSequenceRoute, async (ctx) => {
  try {
    const commandContext: CommandContext = {
      storageService: ctx.get("storageService"),
      projectContext: ctx.get("projectContext")!,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const sequence = await executeCommand(
      ensureMainSequenceCommand,
      "sequence:ensure-main",
      commandContext,
      undefined,
    );
    return ctx.json(sequence, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(getSequenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const sequence = await storageService.sequences.read(projectContext, sequenceId);
    return ctx.json(sequence, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(getSequenceContentsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");

    const [sequence, indexedFragments] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.readAll(projectContext),
    ]);

    const placedUuids = sequence.sections.flatMap((section) =>
      [...section.fragments]
        .sort((a, b) => a.position - b.position)
        .map((position) => position.fragmentUuid),
    );
    const placedSet = new Set(placedUuids);

    const poolUuids = indexedFragments
      .filter((fragment) => !fragment.isDiscarded && !placedSet.has(fragment.uuid))
      .map((fragment) => fragment.uuid);

    // The index omits fragment content (it is an index summary), so read the full
    // body per fragment — mirrors the preview route's per-fragment read.
    const neededUuids = [...new Set([...placedUuids, ...poolUuids])];
    const fragmentResults = await Promise.allSettled(
      neededUuids.map((uuid) => storageService.fragments.read(projectContext, uuid)),
    );

    // A fragment whose read rejects is dropped from the response (the spine
    // simply omits its chunk). Log it so a content row silently missing from the
    // spine — while still listed in the reorder list — is diagnosable.
    const logger = ctx.get("logger");
    fragmentResults.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.warn(
          { fragmentUuid: neededUuids[index], error: result.reason },
          "Failed to read fragment content for sequence contents endpoint",
        );
      }
    });

    const fragmentByUuid = new Map(
      fragmentResults.flatMap((result) =>
        result.status === "fulfilled" ? [[result.value.uuid, result.value]] : [],
      ),
    );

    const toContent = (fragmentUuid: string) => {
      const fragment = fragmentByUuid.get(fragmentUuid);
      if (!fragment) return [];
      return [{ fragmentUuid, key: fragment.key, content: fragment.content }];
    };

    const placed = placedUuids.flatMap(toContent);
    const pool = poolUuids.flatMap(toContent);

    return ctx.json({ placed, pool }, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(createSequenceRoute, async (ctx) => {
  try {
    const { name, isMain, active, origin } = ctx.req.valid("json");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(createSequenceCommand, "sequence:create", commandContext, {
      name,
      isMain: isMain ?? false,
      active,
      origin,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 201);
  } catch (error) {
    return throwSequenceNameOrStorageError(error);
  }
});

sequencesRouter.openapi(updateSequenceRoute, async (ctx) => {
  try {
    const { sequenceId } = ctx.req.valid("param");
    const patch = ctx.req.valid("json");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(updateSequenceCommand, "sequence:update", commandContext, {
      sequenceId,
      patch,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwSequenceNameOrStorageError(error);
  }
});

sequencesRouter.openapi(deleteSequenceRoute, async (ctx) => {
  try {
    const { sequenceId } = ctx.req.valid("param");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(deleteSequenceCommand, "sequence:delete", commandContext, { sequenceId });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(designateSequenceMainRoute, async (ctx) => {
  try {
    const { sequenceId } = ctx.req.valid("param");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(designateSequenceMainCommand, "sequence:designate-main", commandContext, {
      sequenceId,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(placeFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const { fragmentUuid, sectionUuid, position } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const [indexedSequence, indexedFragment] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.read(projectContext, fragmentUuid),
    ]);
    await executeCommand(placeFragmentCommand, "sequence:place-fragment", commandContext, {
      sequenceId,
      fragmentUuid,
      sectionUuid,
      position,
      sequenceName: indexedSequence.name,
      fragmentKey: indexedFragment.key,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(moveFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId, fragmentUuid } = ctx.req.valid("param");
    const { sectionUuid, position } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const [indexedSequence, indexedFragment] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.read(projectContext, fragmentUuid),
    ]);
    await executeCommand(moveFragmentCommand, "sequence:move-fragment", commandContext, {
      sequenceId,
      fragmentUuid,
      sectionUuid,
      position,
      sequenceName: indexedSequence.name,
      fragmentKey: indexedFragment.key,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(createSectionRoute, async (ctx) => {
  try {
    const { sequenceId } = ctx.req.valid("param");
    const { name } = ctx.req.valid("json");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(createSectionCommand, "sequence:create-section", commandContext, {
      sequenceId,
      name,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(renameSectionRoute, async (ctx) => {
  try {
    const { sequenceId, sectionId } = ctx.req.valid("param");
    const { name } = ctx.req.valid("json");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(renameSectionCommand, "sequence:rename-section", commandContext, {
      sequenceId,
      sectionId,
      name,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(reorderSectionRoute, async (ctx) => {
  try {
    const { sequenceId, sectionId } = ctx.req.valid("param");
    const { position } = ctx.req.valid("json");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const indexedSequence = await storageService.sequences.read(projectContext, sequenceId);
    const section = indexedSequence.sections.find((s) => s.uuid === sectionId);
    await executeCommand(moveSectionCommand, "sequence:move-section", commandContext, {
      sequenceId,
      sectionId,
      position,
      sequenceName: indexedSequence.name,
      sectionName: section?.name ?? sectionId,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(deleteSectionRoute, async (ctx) => {
  try {
    const { sequenceId, sectionId } = ctx.req.valid("param");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(deleteSectionCommand, "sequence:delete-section", commandContext, {
      sequenceId,
      sectionId,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(unplaceFragmentRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId, fragmentUuid } = ctx.req.valid("param");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const [indexedSequence, indexedFragment] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.read(projectContext, fragmentUuid),
    ]);
    await executeCommand(unplaceFragmentCommand, "sequence:unplace-fragment", commandContext, {
      sequenceId,
      fragmentUuid,
      sequenceName: indexedSequence.name,
      fragmentKey: indexedFragment.key,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(groupFragmentsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const { fragmentUuids, name } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const indexedSequence = await storageService.sequences.read(projectContext, sequenceId);
    await executeCommand(groupFragmentsCommand, "sequence:group-fragments", commandContext, {
      sequenceId,
      fragmentUuids,
      sectionName: name,
      sequenceName: indexedSequence.name,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(moveFragmentsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const { fragmentUuids, sectionUuid, position } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const indexedSequence = await storageService.sequences.read(projectContext, sequenceId);
    const section = indexedSequence.sections.find((s) => s.uuid === sectionUuid);
    await executeCommand(moveFragmentsCommand, "sequence:move-fragments", commandContext, {
      sequenceId,
      fragmentUuids,
      sectionUuid,
      position,
      sequenceName: indexedSequence.name,
      sectionName: section?.name ?? sectionUuid,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(splitSectionRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const { fragmentUuid, name } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const indexedSequence = await storageService.sequences.read(projectContext, sequenceId);
    await executeCommand(splitSectionCommand, "sequence:split-section", commandContext, {
      sequenceId,
      fragmentUuid,
      sectionName: name,
      sequenceName: indexedSequence.name,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(mergeSectionRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId, sectionId } = ctx.req.valid("param");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    const indexedSequence = await storageService.sequences.read(projectContext, sequenceId);
    const section = indexedSequence.sections.find((s) => s.uuid === sectionId);
    await executeCommand(mergeSectionCommand, "sequence:merge-section", commandContext, {
      sequenceId,
      sectionId,
      sequenceName: indexedSequence.name,
      sectionName: section?.name ?? sectionId,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(cloneSequenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const { name } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(cloneSequenceCommand, "sequence:clone", commandContext, {
      sequenceId,
      name,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(insertSequenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { sequenceId } = ctx.req.valid("param");
    const { sourceSequenceId, sectionIndex } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(insertSequenceCommand, "sequence:insert", commandContext, {
      targetSequenceId: sequenceId,
      sourceSequenceId,
      sectionIndex,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

sequencesRouter.openapi(generateSequenceRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { name, constraintSequenceIds } = ctx.req.valid("json");
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      correlationId: ctx.get("correlationId"),
      logger: ctx.get("logger"),
    };
    await executeCommand(generateShuffleSequenceCommand, "sequence:shuffle", commandContext, {
      name,
      constraintSequenceIds,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});
