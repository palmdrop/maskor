import type { ProjectUUID } from "@maskor/shared";
import { createVault } from "../backend/markdown";
import type { Vault } from "../backend/types";
import { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "../db";
import { createProjectRegistry } from "../registry/registry";
import { ProjectNotFoundError } from "../registry/errors";
import type { ProjectContext, ProjectRecord } from "../registry/types";

export type StorageServiceConfig = {
  configDirectory?: string;
};

export const createStorageService = (config: StorageServiceConfig = {}) => {
  const configDirectory = config.configDirectory ?? DEFAULT_CONFIG_DIRECTORY;
  const database = createRegistryDatabase(configDirectory);
  const registry = createProjectRegistry(database);
  const vaultCache = new Map<ProjectUUID, Vault>();

  return {
    async registerProject(name: string, vaultPath: string): Promise<ProjectRecord> {
      return registry.registerProject(name, vaultPath);
    },

    async listProjects(): Promise<ProjectRecord[]> {
      return registry.listProjects();
    },

    async removeProject(projectUUID: ProjectUUID): Promise<void> {
      await registry.removeProject(projectUUID);
      vaultCache.delete(projectUUID);
    },

    async resolveProject(projectUUID: ProjectUUID): Promise<ProjectContext> {
      const record = await registry.findByUUID(projectUUID);
      if (!record) {
        throw new ProjectNotFoundError(projectUUID);
      }
      return {
        userUUID: record.userUUID,
        projectUUID: record.projectUUID,
        vaultPath: record.vaultPath,
      };
    },

    getVault(context: ProjectContext): Vault {
      const cached = vaultCache.get(context.projectUUID);
      if (cached) {
        return cached;
      }
      const vault = createVault({ root: context.vaultPath });
      vaultCache.set(context.projectUUID, vault);
      return vault;
    },
  };
};

export type StorageService = ReturnType<typeof createStorageService>;
