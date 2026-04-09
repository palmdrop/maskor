import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { isAbsolute } from "node:path";
import type { AppVariables } from "../app";
import { throwStorageError } from "../errors";
import { ProjectSchema, ProjectCreateSchema, ProjectUUIDParamSchema } from "../schemas/project";
import { ErrorResponseSchema } from "../schemas/error";

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
    const { name, vaultPath } = ctx.req.valid("json");

    if (!isAbsolute(vaultPath)) {
      return ctx.json({ error: "BAD_REQUEST", message: "vaultPath must be an absolute path" }, 400);
    }

    const project = await storageService.registerProject(name, vaultPath);
    return ctx.json(project, 201);
  } catch (error) {
    return throwStorageError(error);
  }
});

projectsRouter.openapi(deleteProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");
    await storageService.removeProject(projectId);
    return ctx.body(null, 204);
  } catch (error) {
    return throwStorageError(error);
  }
});
