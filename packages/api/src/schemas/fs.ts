import { z } from "@hono/zod-openapi";

export const FsEntrySchema = z
  .object({
    name: z.string().openapi({ example: "my-folder" }),
    kind: z.enum(["file", "directory"]).openapi({ example: "directory" }),
    hidden: z.boolean().openapi({ example: false }),
    hasMaskorManifest: z.boolean().openapi({ example: false }),
    hasObsidianDir: z.boolean().openapi({ example: false }),
  })
  .openapi("FsEntry");

export const FsListResponseSchema = z
  .object({
    path: z.string().openapi({ example: "/Users/me/Documents" }),
    parent: z.string().nullable().openapi({ example: "/Users/me" }),
    entries: z.array(FsEntrySchema),
  })
  .openapi("FsListResponse");
