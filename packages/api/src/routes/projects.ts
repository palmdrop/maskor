import { Hono } from "hono";
import { isAbsolute } from "node:path";
import type { ProjectUUID } from "@maskor/shared";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";

export const projectsRouter = new Hono<{ Variables: AppVariables }>();

projectsRouter.get("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projects = await storageService.listProjects();
    return ctx.json(projects);
  } catch (error) {
    return handleStorageError(error);
  }
});

projectsRouter.get("/:projectId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.param();
    const project = await storageService.getProject(projectId as ProjectUUID);
    return ctx.json(project);
  } catch (error) {
    return handleStorageError(error);
  }
});

projectsRouter.post("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const body = await ctx.req.json<{ name?: string; vaultPath?: string }>();

    if (!body.name || !body.vaultPath) {
      return ctx.json({ error: "BAD_REQUEST", message: "name and vaultPath are required" }, 400);
    }

    if (!isAbsolute(body.vaultPath)) {
      return ctx.json({ error: "BAD_REQUEST", message: "vaultPath must be an absolute path" }, 400);
    }

    const project = await storageService.registerProject(body.name, body.vaultPath);
    return ctx.json(project, 201);
  } catch (error) {
    return handleStorageError(error);
  }
});

projectsRouter.delete("/:projectId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const { projectId } = ctx.req.param();
    await storageService.removeProject(projectId as ProjectUUID);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleStorageError(error);
  }
});
