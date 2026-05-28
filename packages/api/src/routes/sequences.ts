import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
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
  SequenceBundledResponseSchema,
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
  placeFragmentCommand,
  moveFragmentCommand,
  unplaceFragmentCommand,
} from "../commands";
import type { CommandContext } from "../commands";
import type { StorageService, ProjectContext } from "@maskor/storage";

export const sequencesRouter = new OpenAPIHono<{ Variables: AppVariables }>();

async function buildBundledResponse(
  storageService: StorageService,
  projectContext: ProjectContext,
) {
  const allSequences = await storageService.sequences.readAll(projectContext);
  const main = allSequences.find((s) => s.isMain) ?? null;
  const secondaries = allSequences.filter((s) => !s.isMain);
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
      logger: ctx.get("logger"),
    };
    const sequence = await executeCommand(ensureMainSequenceCommand, commandContext, undefined);
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

sequencesRouter.openapi(createSequenceRoute, async (ctx) => {
  try {
    const { name, isMain } = ctx.req.valid("json");
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const commandContext: CommandContext = {
      storageService,
      projectContext,
      actor: "user",
      logger: ctx.get("logger"),
    };
    await executeCommand(createSequenceCommand, commandContext, {
      name,
      isMain: isMain ?? false,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 201);
  } catch (error) {
    return throwStorageError(error);
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
      logger: ctx.get("logger"),
    };
    await executeCommand(updateSequenceCommand, commandContext, {
      sequenceId,
      patch,
    });
    const bundle = await buildBundledResponse(storageService, projectContext);
    return ctx.json(bundle, 200);
  } catch (error) {
    return throwStorageError(error);
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
      logger: ctx.get("logger"),
    };
    await executeCommand(deleteSequenceCommand, commandContext, { sequenceId });
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
      logger: ctx.get("logger"),
    };
    await executeCommand(designateSequenceMainCommand, commandContext, { sequenceId });
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
      logger: ctx.get("logger"),
    };
    const [indexedSequence, indexedFragment] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.read(projectContext, fragmentUuid),
    ]);
    await executeCommand(placeFragmentCommand, commandContext, {
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
      logger: ctx.get("logger"),
    };
    const [indexedSequence, indexedFragment] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.read(projectContext, fragmentUuid),
    ]);
    await executeCommand(moveFragmentCommand, commandContext, {
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
      logger: ctx.get("logger"),
    };
    await executeCommand(createSectionCommand, commandContext, { sequenceId, name });
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
      logger: ctx.get("logger"),
    };
    await executeCommand(renameSectionCommand, commandContext, { sequenceId, sectionId, name });
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
      logger: ctx.get("logger"),
    };
    await executeCommand(deleteSectionCommand, commandContext, { sequenceId, sectionId });
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
      logger: ctx.get("logger"),
    };
    const [indexedSequence, indexedFragment] = await Promise.all([
      storageService.sequences.read(projectContext, sequenceId),
      storageService.fragments.read(projectContext, fragmentUuid),
    ]);
    await executeCommand(unplaceFragmentCommand, commandContext, {
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
