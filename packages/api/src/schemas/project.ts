import { z } from "@hono/zod-openapi";
import {
  ProjectSchema as DomainProjectSchema,
  ProjectCreateSchema as DomainProjectCreateSchema,
  ProjectUpdateSchema as DomainProjectUpdateSchema,
} from "@maskor/shared";

export const ProjectUUIDParamSchema = z.object({
  projectId: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

// API response: uuid renamed to projectUUID, userUUID added (registry field),
// collection fields omitted, dates serialized as strings
export const ProjectSchema = DomainProjectSchema.omit({
  uuid: true,
  notes: true,
  aspects: true,
  references: true,
  arcs: true,
  createdAt: true,
  updatedAt: true,
})
  .extend({
    projectUUID: z.uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    userUUID: z.string().openapi({ example: "local" }),
    createdAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
    updatedAt: z.string().openapi({ example: "2026-01-01T00:00:00.000Z" }),
  })
  .openapi("Project");

export const ProjectCreateSchema = DomainProjectCreateSchema.extend({
  name: z.string().min(1).openapi({ example: "My Writing Project" }),
  vaultPath: z.string().min(1).openapi({ example: "/Users/me/Documents/my-vault" }),
  mode: z.enum(["adopt", "create"]).openapi({ example: "adopt" }),
}).openapi("ProjectCreate");

export const ProjectUpdateSchema = DomainProjectUpdateSchema.extend({}).openapi("ProjectUpdate");

export const ProjectVaultPathUpdateSchema = z
  .object({
    newPath: z.string().min(1).openapi({ example: "/Users/me/new-location/my-vault" }),
    forceOverride: z.boolean().optional().openapi({ example: false }),
  })
  .openapi("ProjectVaultPathUpdate");

export const ProjectDeleteResultSchema = z
  .object({
    method: z.enum(["trash", "hard-delete"]).openapi({ example: "trash" }),
  })
  .openapi("ProjectDeleteResult");
