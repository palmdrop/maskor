import { z } from "@hono/zod-openapi";

export const ProjectUUIDParamSchema = z.object({
  projectId: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

export const ProjectSchema = z
  .object({
    projectUUID: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    userUUID: z.string().openapi({ example: "local" }),
    name: z.string().openapi({ example: "My Writing Project" }),
    vaultPath: z.string().openapi({ example: "/Users/me/Documents/my-vault" }),
    createdAt: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2026-01-01T00:00:00.000Z" }),
  })
  .openapi("Project");

export const ProjectCreateSchema = z
  .object({
    name: z.string().min(1).openapi({ example: "My Writing Project" }),
    vaultPath: z.string().min(1).openapi({ example: "/Users/me/Documents/my-vault" }),
  })
  .openapi("ProjectCreate");
