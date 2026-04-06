import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { isAbsolute } from "node:path";
import type { ProjectUUID } from "@maskor/shared";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import { ProjectSchema, ProjectCreateSchema, ProjectUUIDParamSchema } from "../schemas/project";
import { ErrorResponseSchema } from "../schemas/error";

export const projectsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listProjectsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Projects"],
  summary: "List all registered projects",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ProjectSchema) } },
      description: "List of projects",
    },
  },
});

const getProjectRoute = createRoute({
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
  },
});

const createProjectRoute = createRoute({
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
  },
});

const deleteProjectRoute = createRoute({
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
  },
});

projectsRouter.openapi(listProjectsRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projects = await storageService.listProjects();
    return ctx.json(projects as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

projectsRouter.openapi(getProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");
    const project = await storageService.getProject(projectId as ProjectUUID);
    return ctx.json(project as never, 200);
  } catch (error) {
    return handleStorageError(error) as never;
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
    return ctx.json(project as never, 201);
  } catch (error) {
    return handleStorageError(error) as never;
  }
});

projectsRouter.openapi(deleteProjectRoute, async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.valid("param");
    await storageService.removeProject(projectId as ProjectUUID);
    return new Response(null, { status: 204 }) as never;
  } catch (error) {
    return handleStorageError(error) as never;
  }
});
