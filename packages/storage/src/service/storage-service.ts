import type { Aspect, Fragment, FragmentUUID, Note, Pool, Reference } from "@maskor/shared";
import type { AspectUUID, NoteUUID, ReferenceUUID, ProjectUUID } from "@maskor/shared";
import { createVault } from "../vault/markdown";
import type { Vault } from "../vault/types";
import { VaultError } from "../vault/types";
import { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "../db/registry";
import { createVaultDatabase } from "../db/vault";
import type { VaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import type { VaultIndexer } from "../indexer/types";
import type {
  IndexedAspect,
  IndexedFragment,
  IndexedNote,
  IndexedReference,
  RebuildStats,
} from "../indexer/types";
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

  // --- private helpers ---

  const getVault = (context: ProjectContext): Vault => {
    const cached = vaultCache.get(context.projectUUID);
    if (cached) return cached;

    const vault = createVault({ root: context.vaultPath });
    vaultCache.set(context.projectUUID, vault);
    return vault;
  };

  const getVaultDatabase = (context: ProjectContext): VaultDatabase => {
    const cached = vaultDatabaseCache.get(context.projectUUID);
    if (cached) return cached;

    const vaultDatabase = createVaultDatabase(context.vaultPath);
    vaultDatabaseCache.set(context.projectUUID, vaultDatabase);
    return vaultDatabase;
  };

  const getVaultIndexer = (context: ProjectContext): VaultIndexer => {
    const cached = vaultIndexerCache.get(context.projectUUID);
    if (cached) return cached;

    const vault = getVault(context);
    const vaultDatabase = getVaultDatabase(context);
    const indexer = createVaultIndexer(vaultDatabase, vault);
    vaultIndexerCache.set(context.projectUUID, indexer);
    return indexer;
  };

  // --- public API ---

  return {
    // Registry operations (no context required)

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
      const { userUUID, vaultPath } = record;
      return { userUUID, projectUUID: record.projectUUID, vaultPath };
    },

    // Fragment operations

    fragments: {
      async read(context: ProjectContext, uuid: FragmentUUID): Promise<Fragment> {
        const indexer = getVaultIndexer(context);
        const filePath = await indexer.fragments.findFilePath(uuid);

        if (!filePath) {
          // TODO: FRAGMENT_NOT_FOUND is acceptable during the watcher catch-up window (e.g. a
          // fragment written to the vault but not yet indexed). The API layer should surface this
          // as a transient error and let the client retry after the next rebuild/watcher tick.
          throw new VaultError("FRAGMENT_NOT_FOUND", `Fragment "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        return getVault(context).fragments.read(filePath);
      },

      async readAll(context: ProjectContext): Promise<IndexedFragment[]> {
        return getVaultIndexer(context).fragments.findAll();
      },

      async findByPool(context: ProjectContext, pool: Pool): Promise<IndexedFragment[]> {
        return getVaultIndexer(context).fragments.findByPool(pool);
      },

      async write(context: ProjectContext, fragment: Fragment): Promise<void> {
        // TODO: if a fragment's title changes, write() creates a new file at the new slug path.
        // The old file is not removed and becomes orphaned until the next rebuild soft-deletes it.
        await getVault(context).fragments.write(fragment);
      },

      async discard(context: ProjectContext, uuid: FragmentUUID): Promise<void> {
        const indexer = getVaultIndexer(context);
        const filePath = await indexer.fragments.findFilePath(uuid);

        if (!filePath) {
          throw new VaultError(
            "FRAGMENT_NOT_FOUND",
            `Cannot discard: fragment "${uuid}" not found in index`,
            { uuid, reason: "UUID not present in vault index" },
          );
        }

        // TODO: the vault index is stale after discard until the next rebuild(). A subsequent
        // findFilePath(uuid) will return the old (now-moved) path, causing FILE_NOT_FOUND.
        // Once the chokidar watcher is added this becomes a non-issue.
        await getVault(context).fragments.discard(filePath);
      },
    },

    // Aspect operations

    aspects: {
      async read(context: ProjectContext, uuid: AspectUUID): Promise<Aspect> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.aspects.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Aspect "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        return getVault(context).aspects.read(indexed.filePath);
      },

      async readAll(context: ProjectContext): Promise<IndexedAspect[]> {
        return getVaultIndexer(context).aspects.findAll();
      },

      async write(context: ProjectContext, aspect: Aspect): Promise<void> {
        await getVault(context).aspects.write(aspect);
      },
    },

    // Note operations

    notes: {
      async read(context: ProjectContext, uuid: NoteUUID): Promise<Note> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.notes.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Note "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        return getVault(context).notes.read(indexed.filePath);
      },

      async readAll(context: ProjectContext): Promise<IndexedNote[]> {
        return getVaultIndexer(context).notes.findAll();
      },

      async write(context: ProjectContext, note: Note): Promise<void> {
        await getVault(context).notes.write(note);
      },
    },

    // Reference operations

    references: {
      async read(context: ProjectContext, uuid: ReferenceUUID): Promise<Reference> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.references.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Reference "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        return getVault(context).references.read(indexed.filePath);
      },

      async readAll(context: ProjectContext): Promise<IndexedReference[]> {
        return getVaultIndexer(context).references.findAll();
      },

      async write(context: ProjectContext, reference: Reference): Promise<void> {
        await getVault(context).references.write(reference);
      },
    },

    // Piece operations

    pieces: {
      async consumeAll(context: ProjectContext): Promise<Fragment[]> {
        return getVault(context).pieces.consumeAll();
      },
    },

    // Index operations

    index: {
      async rebuild(context: ProjectContext): Promise<RebuildStats> {
        return getVaultIndexer(context).rebuild();
      },
    },
  };
};

export type StorageService = ReturnType<typeof createStorageService>;
