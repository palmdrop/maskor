import { Hono } from "hono";
import type { AppVariables } from "../app";
import { handleStorageError } from "../errors";
import type { Fragment, FragmentUUID, Pool } from "@maskor/shared";
import { randomUUID } from "node:crypto";

export const fragmentsRouter = new Hono<{ Variables: AppVariables }>();

fragmentsRouter.get("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const pool = ctx.req.query("pool") as Pool | undefined;

    const fragments = pool
      ? await storageService.fragments.findByPool(projectContext, pool)
      : await storageService.fragments.readAll(projectContext);

    return ctx.json(fragments);
  } catch (error) {
    return handleStorageError(error);
  }
});

fragmentsRouter.get("/:fragmentId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.param();
    const fragment = await storageService.fragments.read(
      projectContext,
      fragmentId as FragmentUUID,
    );
    return ctx.json(fragment);
  } catch (error) {
    return handleStorageError(error);
  }
});

fragmentsRouter.post("/", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const body = await ctx.req.json<{ title?: string; content?: string; pool?: Pool }>();

    if (!body.title || !body.content || !body.pool) {
      return ctx.json(
        { error: "BAD_REQUEST", message: "title, content, and pool are required" },
        400,
      );
    }

    const fragment: Fragment = {
      uuid: randomUUID() as FragmentUUID,
      title: body.title,
      content: body.content,
      pool: body.pool,
      version: 1,
      readyStatus: 0,
      notes: [],
      references: [],
      properties: {},
      contentHash: "", // TODO: compute a real hash (e.g. Bun.hash) once downstream consumers rely on this for change detection
      updatedAt: new Date(),
    };

    // NOTE: After write the index is stale until the next rebuild. Caller is responsible
    // for triggering POST /projects/:projectId/index/rebuild when needed.
    await storageService.fragments.write(projectContext, fragment);
    return ctx.json(fragment, 201);
  } catch (error) {
    return handleStorageError(error);
  }
});

fragmentsRouter.delete("/:fragmentId", async (ctx) => {
  try {
    const storageService = ctx.get("storageService");
    const projectContext = ctx.get("projectContext")!;
    const { fragmentId } = ctx.req.param();

    // NOTE: After discard the index is stale until the next rebuild. Caller is responsible
    // for triggering POST /projects/:projectId/index/rebuild when needed.
    await storageService.fragments.discard(projectContext, fragmentId as FragmentUUID);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleStorageError(error);
  }
});
