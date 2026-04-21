import type { Aspect, Fragment, Logger, Note, Reference, VaultSyncEvent } from "@maskor/shared";
import { slugify } from "@maskor/shared";
import { join } from "node:path";
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
import { createVaultWatcher } from "../watcher/watcher";
import type { VaultWatcher } from "../watcher/watcher";
import {
  loadAspectKeyToUuid,
  upsertFragment,
  upsertAspect,
  upsertNote,
  upsertReference,
  softDeleteFragmentByFilePath,
  softDeleteAspectByFilePath,
  softDeleteNoteByFilePath,
  softDeleteReferenceByFilePath,
} from "../indexer/upserts";
import { parseFile } from "../vault/markdown/parse";
import * as fragmentMapper from "../vault/markdown/mappers/fragment";

export type StorageServiceConfig = {
  logger?: Logger;
  configDirectory?: string;
};

export const createStorageService = (config: StorageServiceConfig = {}) => {
  const configDirectory = config.configDirectory ?? DEFAULT_CONFIG_DIRECTORY;
  const logger = config.logger;

  const log =
    logger?.child({ module: "service" }) ??
    ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => log,
    } as unknown as Logger);

  const database = createRegistryDatabase(configDirectory);
  const registry = createProjectRegistry(database);

  const vaultCache = new Map<string, Vault>();
  const vaultDatabaseCache = new Map<string, VaultDatabase>();
  const vaultIndexerCache = new Map<string, VaultIndexer>();
  const vaultWatcherCache = new Map<string, VaultWatcher>();

  // --- private helpers ---

  const getVault = (context: ProjectContext): Vault => {
    const cached = vaultCache.get(context.projectUUID);
    if (cached) return cached;

    const vault = createVault({ root: context.vaultPath, logger });
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

  const getVaultWatcher = (context: ProjectContext): VaultWatcher => {
    const cached = vaultWatcherCache.get(context.projectUUID);
    if (cached) return cached;

    const vault = getVault(context);
    const vaultDatabase = getVaultDatabase(context);
    const watcher = createVaultWatcher(vaultDatabase, vault, logger);
    vaultWatcherCache.set(context.projectUUID, watcher);
    return watcher;
  };

  // --- public API ---

  return {
    // Registry operations (no context required)

    async registerProject(name: string, vaultPath: string): Promise<ProjectRecord> {
      const record = await registry.registerProject(name, vaultPath);
      log.info({ projectUUID: record.projectUUID, name, vaultPath }, "project registered");
      return record;
    },

    async listProjects(): Promise<ProjectRecord[]> {
      return registry.listProjects();
    },

    async removeProject(projectUUID: string): Promise<void> {
      // Stop and evict the watcher first — a stale watcher on a removed project would
      // hold file handles open and continue firing events against a deleted DB.
      const watcherToStop = vaultWatcherCache.get(projectUUID);
      if (watcherToStop) {
        await watcherToStop.stop();
        vaultWatcherCache.delete(projectUUID);
        log.info({ projectUUID }, "watcher stopped for removed project");
      }

      await registry.removeProject(projectUUID);
      vaultCache.delete(projectUUID);
      vaultDatabaseCache.delete(projectUUID);
      vaultIndexerCache.delete(projectUUID);
      log.info({ projectUUID }, "project removed");
    },

    async getProject(projectUUID: string): Promise<ProjectRecord> {
      const record = await registry.findByUUID(projectUUID);
      if (!record) {
        throw new ProjectNotFoundError(projectUUID);
      }
      return record;
    },

    async resolveProject(projectUUID: string): Promise<ProjectContext> {
      const record = await registry.findByUUID(projectUUID);
      if (!record) {
        throw new ProjectNotFoundError(projectUUID);
      }
      const { userUUID, vaultPath } = record;
      return { userUUID, projectUUID: record.projectUUID, vaultPath };
    },

    // Fragment operations

    fragments: {
      async read(context: ProjectContext, uuid: string): Promise<Fragment> {
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

        try {
          return await getVault(context).fragments.read(filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            log.warn({ uuid, filePath }, "stale index: fragment file missing on read");
            throw new VaultError(
              "STALE_INDEX",
              `Fragment "${uuid}" file missing — index may be stale`,
              { uuid, filePath },
            );
          }
          throw error;
        }
      },

      async readAll(context: ProjectContext): Promise<IndexedFragment[]> {
        return getVaultIndexer(context).fragments.findAll();
      },

      async write(context: ProjectContext, fragment: Fragment): Promise<void> {
        // TODO: title-change orphan — write() creates a new file at the new slug path if the title
        // changed. The old file is not removed and becomes orphaned until the next rebuild soft-deletes it.
        await getVault(context).fragments.write(fragment);

        // Inline DB update — closes the stale-index window for API-originated writes.
        // The watcher will fire afterward and hash-guard to a no-op.
        const entityRelativePath = fragment.isDiscarded
          ? join("discarded", `${slugify(fragment.title)}.md`)
          : `${slugify(fragment.title)}.md`;

        const absolutePath = join(context.vaultPath, "fragments", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const vaultDatabase = getVaultDatabase(context);
        const aspectKeyToUuid = loadAspectKeyToUuid(vaultDatabase);

        vaultDatabase.transaction((tx) => {
          upsertFragment(tx, fragment, entityRelativePath, rawContent, aspectKeyToUuid);
        });
      },

      async discard(context: ProjectContext, uuid: string): Promise<void> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.fragments.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError(
            "FRAGMENT_NOT_FOUND",
            `Cannot discard: fragment "${uuid}" not found in index`,
            { uuid, reason: "UUID not present in vault index" },
          );
        }

        const sourceEntityRelativePath = indexed.filePath;
        const destinationEntityRelativePath = join("discarded", `${slugify(indexed.title)}.md`);

        try {
          await getVault(context).fragments.discard(sourceEntityRelativePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            log.warn(
              { uuid, filePath: sourceEntityRelativePath },
              "stale index: fragment file missing on discard",
            );
            throw new VaultError(
              "STALE_INDEX",
              `Cannot discard: fragment "${uuid}" file missing — index may be stale`,
              { uuid, filePath: sourceEntityRelativePath },
            );
          }
          throw error;
        }

        // Inline DB update: soft-delete old path, upsert at new discarded path.
        const absoluteDestination = join(
          context.vaultPath,
          "fragments",
          destinationEntityRelativePath,
        );
        const rawContent = await Bun.file(absoluteDestination).text();
        const vaultDatabase = getVaultDatabase(context);
        const aspectKeyToUuid = loadAspectKeyToUuid(vaultDatabase);

        // Parse the discarded fragment directly from rawContent — avoids a second file read.
        // isDiscarded is derived from the destination path in fromFile.
        const discardedFragment = fragmentMapper.fromFile(
          parseFile(rawContent),
          destinationEntityRelativePath,
        );

        vaultDatabase.transaction((tx) => {
          softDeleteFragmentByFilePath(tx, sourceEntityRelativePath);
          upsertFragment(
            tx,
            discardedFragment,
            destinationEntityRelativePath,
            rawContent,
            aspectKeyToUuid,
          );
        });
      },

      async restore(context: ProjectContext, uuid: string): Promise<void> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.fragments.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError(
            "FRAGMENT_NOT_FOUND",
            `Cannot restore: fragment "${uuid}" not found in index`,
            { uuid, reason: "UUID not present in vault index" },
          );
        }

        if (!indexed.isDiscarded) {
          throw new VaultError(
            "FRAGMENT_NOT_DISCARDED",
            `Cannot restore: fragment "${uuid}" is not discarded`,
            { uuid },
          );
        }

        // TODO: restore-collision — if a fragment already exists at the destination slug,
        // rename will overwrite it silently. Guard with an existence check or unique slug.
        const sourceEntityRelativePath = indexed.filePath;
        const destinationEntityRelativePath = `${slugify(indexed.title)}.md`;

        try {
          await getVault(context).fragments.restore(sourceEntityRelativePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            log.warn(
              { uuid, filePath: sourceEntityRelativePath },
              "stale index: fragment file missing on restore",
            );
            throw new VaultError(
              "STALE_INDEX",
              `Cannot restore: fragment "${uuid}" file missing — index may be stale`,
              { uuid, filePath: sourceEntityRelativePath },
            );
          }
          throw error;
        }

        // Inline DB update: soft-delete old discarded path, upsert at restored path.
        const absoluteDestination = join(
          context.vaultPath,
          "fragments",
          destinationEntityRelativePath,
        );
        const rawContent = await Bun.file(absoluteDestination).text();
        const vaultDatabase = getVaultDatabase(context);
        const aspectKeyToUuid = loadAspectKeyToUuid(vaultDatabase);

        const restoredFragment = fragmentMapper.fromFile(
          parseFile(rawContent),
          destinationEntityRelativePath,
        );

        vaultDatabase.transaction((tx) => {
          softDeleteFragmentByFilePath(tx, sourceEntityRelativePath);
          upsertFragment(
            tx,
            restoredFragment,
            destinationEntityRelativePath,
            rawContent,
            aspectKeyToUuid,
          );
        });
      },
    },

    // Aspect operations

    aspects: {
      async read(context: ProjectContext, uuid: string): Promise<Aspect> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.aspects.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Aspect "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        try {
          return await getVault(context).aspects.read(indexed.filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            throw new VaultError(
              "STALE_INDEX",
              `Aspect "${uuid}" file missing — index may be stale`,
              { uuid, filePath: indexed.filePath },
            );
          }
          throw error;
        }
      },

      async readAll(context: ProjectContext): Promise<IndexedAspect[]> {
        return getVaultIndexer(context).aspects.findAll();
      },

      async write(context: ProjectContext, aspect: Aspect): Promise<void> {
        await getVault(context).aspects.write(aspect);

        // Inline DB update — closes the stale-index window for API-originated writes.
        // Aspects have no contentHash column, so no file re-read is needed.
        const entityRelativePath = `${slugify(aspect.key)}.md`;
        const vaultDatabase = getVaultDatabase(context);

        vaultDatabase.transaction((tx) => {
          upsertAspect(tx, aspect, entityRelativePath);
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.aspects.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError(
            "ENTITY_NOT_FOUND",
            `Cannot delete: aspect "${uuid}" not found in index`,
            { uuid, reason: "UUID not present in vault index" },
          );
        }

        try {
          await getVault(context).aspects.delete(indexed.filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            log.warn(
              { uuid, filePath: indexed.filePath },
              "stale index: aspect file missing on delete",
            );
            throw new VaultError(
              "STALE_INDEX",
              `Cannot delete: aspect "${uuid}" file missing — index may be stale`,
              { uuid, filePath: indexed.filePath },
            );
          }
          throw error;
        }

        // TODO: non-atomic two-step — file is unlinked before the DB row is soft-deleted.
        // If the transaction fails after unlink, the DB row remains active with a dead file path.
        // A subsequent full rebuild will clean it up, but until then the entity appears stale.
        const vaultDatabase = getVaultDatabase(context);
        vaultDatabase.transaction((tx) => {
          softDeleteAspectByFilePath(tx, indexed.filePath);
        });
      },
    },

    // Note operations

    notes: {
      async read(context: ProjectContext, uuid: string): Promise<Note> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.notes.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Note "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        try {
          return await getVault(context).notes.read(indexed.filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            throw new VaultError(
              "STALE_INDEX",
              `Note "${uuid}" file missing — index may be stale`,
              { uuid, filePath: indexed.filePath },
            );
          }
          throw error;
        }
      },

      async readAll(context: ProjectContext): Promise<IndexedNote[]> {
        return getVaultIndexer(context).notes.findAll();
      },

      async write(context: ProjectContext, note: Note): Promise<void> {
        await getVault(context).notes.write(note);

        // Inline DB update — closes the stale-index window for API-originated writes.
        const entityRelativePath = `${slugify(note.title)}.md`;
        const absolutePath = join(context.vaultPath, "notes", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const vaultDatabase = getVaultDatabase(context);

        vaultDatabase.transaction((tx) => {
          upsertNote(tx, note, entityRelativePath, rawContent);
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.notes.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError(
            "ENTITY_NOT_FOUND",
            `Cannot delete: note "${uuid}" not found in index`,
            { uuid, reason: "UUID not present in vault index" },
          );
        }

        try {
          await getVault(context).notes.delete(indexed.filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            log.warn(
              { uuid, filePath: indexed.filePath },
              "stale index: note file missing on delete",
            );
            throw new VaultError(
              "STALE_INDEX",
              `Cannot delete: note "${uuid}" file missing — index may be stale`,
              { uuid, filePath: indexed.filePath },
            );
          }
          throw error;
        }

        // TODO: non-atomic two-step — file is unlinked before the DB row is soft-deleted.
        // If the transaction fails after unlink, the DB row remains active with a dead file path.
        // A subsequent full rebuild will clean it up, but until then the entity appears stale.
        const vaultDatabase = getVaultDatabase(context);
        vaultDatabase.transaction((tx) => {
          softDeleteNoteByFilePath(tx, indexed.filePath);
        });
      },
    },

    // Reference operations

    references: {
      async read(context: ProjectContext, uuid: string): Promise<Reference> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.references.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Reference "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        try {
          return await getVault(context).references.read(indexed.filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            throw new VaultError(
              "STALE_INDEX",
              `Reference "${uuid}" file missing — index may be stale`,
              { uuid, filePath: indexed.filePath },
            );
          }
          throw error;
        }
      },

      async readAll(context: ProjectContext): Promise<IndexedReference[]> {
        return getVaultIndexer(context).references.findAll();
      },

      async write(context: ProjectContext, reference: Reference): Promise<void> {
        await getVault(context).references.write(reference);

        // Inline DB update — closes the stale-index window for API-originated writes.
        const entityRelativePath = `${slugify(reference.name)}.md`;
        const absolutePath = join(context.vaultPath, "references", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const vaultDatabase = getVaultDatabase(context);

        vaultDatabase.transaction((tx) => {
          upsertReference(tx, reference, entityRelativePath, rawContent);
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.references.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError(
            "ENTITY_NOT_FOUND",
            `Cannot delete: reference "${uuid}" not found in index`,
            { uuid, reason: "UUID not present in vault index" },
          );
        }

        try {
          await getVault(context).references.delete(indexed.filePath);
        } catch (error) {
          if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
            log.warn(
              { uuid, filePath: indexed.filePath },
              "stale index: reference file missing on delete",
            );
            throw new VaultError(
              "STALE_INDEX",
              `Cannot delete: reference "${uuid}" file missing — index may be stale`,
              { uuid, filePath: indexed.filePath },
            );
          }
          throw error;
        }

        // TODO: non-atomic two-step — file is unlinked before the DB row is soft-deleted.
        // If the transaction fails after unlink, the DB row remains active with a dead file path.
        // A subsequent full rebuild will clean it up, but until then the entity appears stale.
        const vaultDatabase = getVaultDatabase(context);
        vaultDatabase.transaction((tx) => {
          softDeleteReferenceByFilePath(tx, indexed.filePath);
        });
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
        // Pause the watcher during rebuild to prevent the watcher/rebuild race:
        // a watcher event mid-rebuild would be overwritten by rebuild's stale snapshot.
        const watcher = getVaultWatcher(context);
        watcher.pause();
        log.info({ projectUUID: context.projectUUID }, "index rebuild started");
        try {
          const stats = await getVaultIndexer(context).rebuild();
          log.info(
            {
              projectUUID: context.projectUUID,
              fragments: stats.fragments,
              aspects: stats.aspects,
              notes: stats.notes,
              references: stats.references,
              durationMs: Math.round(stats.durationMs),
              warnings: stats.warnings.length,
            },
            "index rebuild complete",
          );
          if (stats.warnings.length > 0) {
            log.warn(
              { projectUUID: context.projectUUID, warnings: stats.warnings },
              "index rebuild completed with warnings",
            );
          }
          return stats;
        } finally {
          watcher.resume();
        }
      },
    },

    // Watcher operations

    watcher: {
      start(context: ProjectContext): void {
        getVaultWatcher(context).start();
      },

      async stop(context: ProjectContext): Promise<void> {
        await getVaultWatcher(context).stop();
      },

      subscribe(context: ProjectContext, callback: (event: VaultSyncEvent) => void): () => void {
        return getVaultWatcher(context).subscribe(callback);
      },
    },
  };
};

export type StorageService = ReturnType<typeof createStorageService>;
