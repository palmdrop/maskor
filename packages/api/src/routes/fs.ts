import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { isAbsolute, join, dirname } from "node:path";
import { readdir, access } from "node:fs/promises";
import type { AppVariables } from "../app";
import { FsListResponseSchema } from "../schemas/fs";
import { ErrorResponseSchema } from "../schemas/error";

export const fsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

const listDirectoryRoute = createRoute({
  operationId: "listDirectory",
  method: "get",
  path: "/list",
  tags: ["Filesystem"],
  summary: "List directory contents for filesystem browsing",
  request: {
    query: z.object({
      path: z.string().openapi({ example: "/Users/me/Documents" }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: FsListResponseSchema } },
      description: "Directory contents",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid path (not absolute)",
    },
    403: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Permission denied",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Path not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Internal error",
    },
  },
});

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

fsRouter.openapi(listDirectoryRoute, async (ctx) => {
  const { path } = ctx.req.valid("query");

  if (!isAbsolute(path)) {
    return ctx.json({ error: "BAD_REQUEST", message: "path must be an absolute path" }, 400);
  }

  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return ctx.json({ error: "NOT_FOUND", message: "Path does not exist" }, 404);
    }
    if (code === "EACCES" || code === "EPERM") {
      return ctx.json({ error: "FORBIDDEN", message: "Permission denied" }, 403);
    }
    throw error;
  }

  const parent = path === dirname(path) ? null : dirname(path);

  const entryResults = await Promise.all(
    entries.map(async (entry) => {
      const isDirectory = entry.isDirectory();
      const name = entry.name;
      const kind: "file" | "directory" = isDirectory ? "directory" : "file";
      const hidden = name.startsWith(".");

      let hasMaskorManifest = false;
      let hasObsidianDir = false;

      if (isDirectory) {
        hasMaskorManifest = await pathExists(join(path, name, ".maskor", "project.json"));
        hasObsidianDir = await pathExists(join(path, name, ".obsidian"));
      }

      return { name, kind, hidden, hasMaskorManifest, hasObsidianDir };
    }),
  );

  return ctx.json({ path, parent, entries: entryResults }, 200);
});
