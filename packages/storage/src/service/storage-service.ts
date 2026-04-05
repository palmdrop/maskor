import type { ProjectUUID } from "@maskor/shared";
import { createVault } from "../vault/markdown";
import type { Vault } from "../vault/types";
import { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "../db/registry";
import { createVaultDatabase } from "../db/vault";
import type { VaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import type { VaultIndexer } from "../indexer/types";
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
  const vaultDatabaseCache = new Map<ProjectUUID, VaultDatabase>();
  const vaultIndexerCache = new Map<ProjectUUID, VaultIndexer>();

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
      vaultDatabaseCache.delete(projectUUID);
      vaultIndexerCache.delete(projectUUID);
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

    getVaultDatabase(context: ProjectContext): VaultDatabase {
      const cached = vaultDatabaseCache.get(context.projectUUID);
      if (cached) {
        return cached;
      }

      const vaultDatabase = createVaultDatabase(context.vaultPath);
      vaultDatabaseCache.set(context.projectUUID, vaultDatabase);

      return vaultDatabase;
    },

    getVaultIndexer(context: ProjectContext): VaultIndexer {
      const cached = vaultIndexerCache.get(context.projectUUID);
      if (cached) {
        return cached;
      }

      const vault = this.getVault(context);
      const vaultDatabase = this.getVaultDatabase(context);
      const indexer = createVaultIndexer(vaultDatabase, vault);
      vaultIndexerCache.set(context.projectUUID, indexer);

      return indexer;
    },
  };
};

export type StorageService = ReturnType<typeof createStorageService>;
