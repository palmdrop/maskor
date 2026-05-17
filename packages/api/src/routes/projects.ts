import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { isAbsolute } from "node:path";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import {
  ProjectSchema,
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectVaultPathUpdateSchema,
  ProjectDeleteResultSchema,
  ProjectUUIDParamSchema,
} from "../schemas/project";
import { ErrorResponseSchema } from "../schemas/error";
import { moveToTrashOrDelete } from "../helpers/trash";

export const projectsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listProjectsRoute = createRoute({
  operationId: "listProjects",
  method: "get",
  path: "/",
  tags: ["Projects"],
  summary: "List all registered projects",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ProjectSchema) } },
      description: "List of projects",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const getProjectRoute = createRoute({
  operationId: "getProject",
  method: "get",
  path: "/{projectId}",
  tags: ["Projects"],
  summary: "Get a project by UUID",
  request: { params: ProjectUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Project record",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Project not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const createProjectRoute = createRoute({
  operationId: "createProject",
  method: "post",
  path: "/",
  tags: ["Projects"],
  summary: "Register a new project",
  request: {
    body: { content: { "application/json": { schema: ProjectCreateSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Project created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "A project is already registered at this vault path",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const updateProjectRoute = createRoute({
  operationId: "updateProject",
  method: "patch",
  path: "/{projectId}",
  tags: ["Projects"],
  summary: "Update a project",
  request: {
    params: ProjectUUIDParamSchema,
    body: { content: { "application/json": { schema: ProjectUpdateSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Updated project",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Project not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const updateVaultPathRoute = createRoute({
  operationId: "updateProjectVaultPath",
  method: "patch",
  path: "/{projectId}/vault-path",
  tags: ["Projects"],
  summary: "Re-point a project's vault to a new path",
  request: {
    params: ProjectUUIDParamSchema,
    body: {
      content: { "application/json": { schema: ProjectVaultPathUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Updated project",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request body",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Project not found",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Vault path conflict or UUID conflict requiring forceOverride",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const deleteProjectRoute = createRoute({
  operationId: "deleteProject",
  method: "delete",
  path: "/{projectId}",
  tags: ["Projects"],
  summary: "Remove a registered project",
  request: { params: ProjectUUIDParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectDeleteResultSchema } },
      description: "Project removed with vault folder deleted",
    },
    204: { description: "Project removed" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Project not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

projectsRouter.openapi(listProjectsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projects = await storageService.listProjects();
    return ctx.json(projects, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

projectsRouter.openapi(getProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");
    const project = await storageService.getProject(projectId);
    return ctx.json(project, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

projectsRouter.openapi(createProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { name, vaultPath, mode } = ctx.req.valid("json");

    if (!isAbsolute(vaultPath)) {
      return ctx.json({ error: "BAD_REQUEST", message: "vaultPath must be an absolute path" }, 400);
    }

    const project = await storageService.registerProject(name, vaultPath, mode);
    return ctx.json(project, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

projectsRouter.openapi(updateProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");
    const patch = ctx.req.valid("json");
    const project = await storageService.updateProject(projectId, patch);
    return ctx.json(project, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

projectsRouter.openapi(updateVaultPathRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");
    const { newPath, forceOverride } = ctx.req.valid("json");

    if (!isAbsolute(newPath)) {
      return ctx.json({ error: "BAD_REQUEST", message: "newPath must be an absolute path" }, 400);
    }

    const project = await storageService.updateProjectVaultPath(projectId, newPath, forceOverride);
    return ctx.json(project, 200);
  } catch (error) {
    return throwStorageError(error);
  }
});

projectsRouter.openapi(deleteProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");

    let deleteFiles = false;
    try {
      const rawBody = (await ctx.req.json()) as { deleteFiles?: boolean };
      deleteFiles = rawBody?.deleteFiles ?? false;
    } catch {
      // No body or non-JSON — treat as deleteFiles: false
    }

    if (deleteFiles) {
      const project = await storageService.getProject(projectId);
      const { method } = await moveToTrashOrDelete(project.vaultPath);
      await storageService.removeProject(projectId);
      return ctx.json({ method }, 200);
    }

    await storageService.removeProject(projectId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
