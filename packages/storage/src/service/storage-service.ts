import type {
  Arc,
  Aspect,
  AspectUpdate,
  AspectUpdateResponse,
  Fragment,
  Logger,
  Note,
  NoteUpdate,
  NoteUpdateResponse,
  Reference,
  ReferenceUpdate,
  ReferenceUpdateResponse,
  VaultSyncEvent,
} from "@maskor/shared";
import { ArcSchema, slugify } from "@maskor/shared";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
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
  loadKnownAspectKeys,
  upsertFragment,
  upsertAspect,
  upsertNote,
  upsertReference,
  deleteReferenceByFilePath,
  deleteFragmentByFilePath,
  deleteAspectByFilePath,
  deleteNoteByFilePath,
  findFragmentUuidsByNoteKey,
  findAspectUuidsByNoteKey,
  findFragmentUuidsByReferenceKey,
  findFragmentUuidsByAspectKey,
} from "../indexer/upserts";
import type { Transaction } from "../indexer/upserts";
import { hashContent } from "../utils/hash";
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
    const watcher = createVaultWatcher(vaultDatabase, vault, logger, {
      onNoteRename: async (oldKey, newKey) => {
        const payload = await cascadeNoteKeyRename(context, oldKey, newKey);
        vaultDatabase.transaction((tx) => payload.commit(tx));
      },
      onReferenceRename: async (oldKey, newKey) => {
        const payload = await cascadeReferenceKeyRename(context, oldKey, newKey);
        vaultDatabase.transaction((tx) => payload.commit(tx));
      },
      onAspectRename: async (oldKey, newKey) => {
        const payload = await cascadeAspectKeyRename(context, oldKey, newKey);
        vaultDatabase.transaction((tx) => payload.commit(tx));
      },
    });
    vaultWatcherCache.set(context.projectUUID, watcher);
    return watcher;
  };

  const readArc = async (context: ProjectContext, aspectKey: string): Promise<Arc | null> => {
    const arcPath = join(context.vaultPath, ".maskor", "config", "arcs", `${aspectKey}.yaml`);
    const file = Bun.file(arcPath);
    if (!(await file.exists())) return null;
    const raw = await file.text();
    const parsed = parseYaml(raw);
    const result = ArcSchema.safeParse(parsed);
    if (!result.success) {
      log.warn({ aspectKey, arcPath }, "arc file failed validation, treating as missing");
      return null;
    }
    return result.data;
  };

  const writeArc = async (context: ProjectContext, arc: Arc): Promise<void> => {
    const arcsDir = join(context.vaultPath, ".maskor", "config", "arcs");
    await mkdir(arcsDir, { recursive: true });
    const arcPath = join(arcsDir, `${arc.aspectKey}.yaml`);
    const raw = stringifyYaml({ uuid: arc.uuid, aspectKey: arc.aspectKey, points: arc.points });
    await Bun.write(arcPath, raw);
  };

  const deleteArc = async (context: ProjectContext, aspectKey: string): Promise<void> => {
    const arcPath = join(context.vaultPath, ".maskor", "config", "arcs", `${aspectKey}.yaml`);
    await unlink(arcPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  };

  // --- cascade helpers ---

  // Each cascade helper writes updated entity files to disk and returns:
  // - the UUIDs of all affected entities
  // - a commit function that callers batch into a single DB transaction together
  //   with the primary entity upsert, preserving atomicity.

  const cascadeFragments = async (
    context: ProjectContext,
    affectedUuids: string[],
    updateFn: (fragment: Fragment) => Fragment,
  ): Promise<{ touched: string[]; commit: (tx: Transaction) => void }> => {
    const vault = getVault(context);
    const vaultDatabase = getVaultDatabase(context);
    const indexer = getVaultIndexer(context);

    type Cascaded = { fragment: Fragment; filePath: string; rawContent: string };
    const touched: string[] = [];
    const cascaded: Cascaded[] = [];

    for (const uuid of affectedUuids) {
      const filePath = await indexer.fragments.findFilePath(uuid);
      if (!filePath) {
        touched.push(uuid);
        continue;
      }
      const updated = updateFn(await vault.fragments.read(filePath));
      await vault.fragments.write(updated);
      const rawContent = await Bun.file(join(context.vaultPath, "fragments", filePath)).text();
      cascaded.push({ fragment: updated, filePath, rawContent });
      touched.push(uuid);
    }

    const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

    return {
      touched,
      commit: (tx) => {
        for (const { fragment, filePath, rawContent } of cascaded) {
          upsertFragment(tx, fragment, filePath, rawContent, knownAspectKeys);
        }
      },
    };
  };

  const cascadeAspects = async (
    context: ProjectContext,
    affectedUuids: string[],
    updateFn: (aspect: Aspect) => Aspect,
  ): Promise<{ touched: string[]; commit: (tx: Transaction) => void }> => {
    const vault = getVault(context);
    const indexer = getVaultIndexer(context);

    type Cascaded = { aspect: Aspect; filePath: string; rawContent: string };
    const touched: string[] = [];
    const cascaded: Cascaded[] = [];

    for (const uuid of affectedUuids) {
      const indexed = await indexer.aspects.findByUUID(uuid);
      if (!indexed) {
        touched.push(uuid);
        continue;
      }
      const updated = updateFn(await vault.aspects.read(indexed.filePath));
      await vault.aspects.write(updated);
      const rawContent = await Bun.file(
        join(context.vaultPath, "aspects", `${updated.key}.md`),
      ).text();
      cascaded.push({ aspect: updated, filePath: indexed.filePath, rawContent });
      touched.push(uuid);
    }

    return {
      touched,
      commit: (tx) => {
        for (const { aspect, filePath, rawContent } of cascaded) {
          upsertAspect(tx, aspect, filePath, rawContent);
        }
      },
    };
  };

  const cascadeNoteKeyRename = async (
    context: ProjectContext,
    oldKey: string,
    newKey: string,
  ): Promise<{ fragments: string[]; aspects: string[]; commit: (tx: Transaction) => void }> => {
    const vaultDatabase = getVaultDatabase(context);
    const fragmentPayload = await cascadeFragments(
      context,
      findFragmentUuidsByNoteKey(vaultDatabase, oldKey),
      (fragment) => ({
        ...fragment,
        notes: fragment.notes.map((note) => (note === oldKey ? newKey : note)),
      }),
    );
    const aspectPayload = await cascadeAspects(
      context,
      findAspectUuidsByNoteKey(vaultDatabase, oldKey),
      (aspect) => ({
        ...aspect,
        notes: aspect.notes.map((note) => (note === oldKey ? newKey : note)),
      }),
    );
    return {
      fragments: fragmentPayload.touched,
      aspects: aspectPayload.touched,
      commit: (tx) => {
        fragmentPayload.commit(tx);
        aspectPayload.commit(tx);
      },
    };
  };

  const cascadeReferenceKeyRename = async (
    context: ProjectContext,
    oldKey: string,
    newKey: string,
  ): Promise<{ fragments: string[]; commit: (tx: Transaction) => void }> => {
    const vaultDatabase = getVaultDatabase(context);
    const fragmentPayload = await cascadeFragments(
      context,
      findFragmentUuidsByReferenceKey(vaultDatabase, oldKey),
      (fragment) => ({
        ...fragment,
        references: fragment.references.map((reference) =>
          reference === oldKey ? newKey : reference,
        ),
      }),
    );
    return {
      fragments: fragmentPayload.touched,
      commit: fragmentPayload.commit,
    };
  };

  const cascadeAspectKeyRename = async (
    context: ProjectContext,
    oldKey: string,
    newKey: string,
  ): Promise<{ fragments: string[]; commit: (tx: Transaction) => void }> => {
    const arc = await readArc(context, oldKey);
    if (arc) {
      await writeArc(context, { ...arc, aspectKey: newKey });
      await deleteArc(context, oldKey);
    }
    const vaultDatabase = getVaultDatabase(context);
    const fragmentPayload = await cascadeFragments(
      context,
      findFragmentUuidsByAspectKey(vaultDatabase, oldKey),
      (fragment) => {
        const oldProperty = fragment.properties[oldKey];
        const updatedProperties = { ...fragment.properties };
        delete updatedProperties[oldKey];
        if (oldProperty !== undefined) {
          updatedProperties[newKey] = oldProperty;
        }
        return { ...fragment, properties: updatedProperties };
      },
    );
    return {
      fragments: fragmentPayload.touched,
      commit: fragmentPayload.commit,
    };
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

    async updateProject(
      projectUUID: string,
      patch: { name?: string; editor?: { vimMode?: boolean; rawMarkdownMode?: boolean } },
    ): Promise<ProjectRecord> {
      const record = await registry.updateProject(projectUUID, patch);
      log.info({ projectUUID, patch }, "project updated");
      return record;
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

      async write(context: ProjectContext, fragment: Fragment): Promise<Fragment> {
        const fragmentToWrite = { ...fragment, updatedAt: new Date() };

        // Capture old path before writing the new file — needed for orphan cleanup on rename.
        const indexer = getVaultIndexer(context);
        const oldFilePath = await indexer.fragments.findFilePath(fragment.uuid);

        await getVault(context).fragments.write(fragmentToWrite);

        // Inline DB update — closes the stale-index window for API-originated writes.
        // The watcher will fire afterward and hash-guard to a no-op.
        const entityRelativePath = fragmentToWrite.isDiscarded
          ? join("discarded", `${slugify(fragmentToWrite.title)}.md`)
          : `${slugify(fragmentToWrite.title)}.md`;

        // If the slug changed, delete the old file so it doesn't become orphaned.
        if (oldFilePath && oldFilePath !== entityRelativePath) {
          const absoluteOldPath = join(context.vaultPath, "fragments", oldFilePath);
          await unlink(absoluteOldPath).catch(() => {
            log.warn({ oldFilePath }, "rename cleanup: old fragment file already gone");
          });
        }

        const absolutePath = join(context.vaultPath, "fragments", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const contentHash = hashContent(rawContent);
        const vaultDatabase = getVaultDatabase(context);
        const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

        vaultDatabase.transaction((tx) => {
          upsertFragment(tx, fragmentToWrite, entityRelativePath, rawContent, knownAspectKeys);
        });

        return { ...fragmentToWrite, contentHash };
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

        const absoluteDestination = join(
          context.vaultPath,
          "fragments",
          destinationEntityRelativePath,
        );
        const rawContent = await Bun.file(absoluteDestination).text();
        const vaultDatabase = getVaultDatabase(context);
        const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

        // Parse the discarded fragment directly from rawContent — avoids a second file read.
        // isDiscarded is derived from the destination path in fromFile.
        const discardedFragment = fragmentMapper.fromFile(
          parseFile(rawContent),
          destinationEntityRelativePath,
        );

        vaultDatabase.transaction((tx) => {
          deleteFragmentByFilePath(tx, sourceEntityRelativePath);
          upsertFragment(
            tx,
            discardedFragment,
            destinationEntityRelativePath,
            rawContent,
            knownAspectKeys,
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

        const absoluteDestination = join(
          context.vaultPath,
          "fragments",
          destinationEntityRelativePath,
        );
        const rawContent = await Bun.file(absoluteDestination).text();
        const vaultDatabase = getVaultDatabase(context);
        const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

        const restoredFragment = fragmentMapper.fromFile(
          parseFile(rawContent),
          destinationEntityRelativePath,
        );

        vaultDatabase.transaction((tx) => {
          deleteFragmentByFilePath(tx, sourceEntityRelativePath);
          upsertFragment(
            tx,
            restoredFragment,
            destinationEntityRelativePath,
            rawContent,
            knownAspectKeys,
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
        const allAspects = await getVaultIndexer(context).aspects.findAll();
        const lowerKey = aspect.key.toLowerCase();
        if (allAspects.some((a) => a.uuid !== aspect.uuid && a.key.toLowerCase() === lowerKey)) {
          throw new VaultError(
            "KEY_CONFLICT",
            `An aspect with key "${aspect.key}" already exists`,
            { reason: "key_conflict" },
          );
        }

        await getVault(context).aspects.write(aspect);

        // Inline DB update — closes the stale-index window for API-originated writes.
        const entityRelativePath = `${aspect.key}.md`;
        const absolutePath = join(context.vaultPath, "aspects", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const vaultDatabase = getVaultDatabase(context);

        vaultDatabase.transaction((tx) => {
          upsertAspect(tx, aspect, entityRelativePath, rawContent);
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

        const vaultDatabase = getVaultDatabase(context);
        vaultDatabase.transaction((tx) => {
          deleteAspectByFilePath(tx, indexed.filePath);
        });
      },

      async update(
        context: ProjectContext,
        uuid: string,
        patch: AspectUpdate,
      ): Promise<AspectUpdateResponse> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.aspects.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Aspect "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        try {
          const current = await getVault(context).aspects.read(indexed.filePath);
          const oldKey = current.key;
          const updated: Aspect = {
            ...current,
            ...(patch.key !== undefined && { key: patch.key }),
            ...(patch.category !== undefined && { category: patch.category }),
            ...(patch.description !== undefined && { description: patch.description }),
            ...(patch.notes !== undefined && { notes: patch.notes }),
          };

          await getVault(context).aspects.write(updated);

          const newFilePath = `${updated.key}.md`;

          if (indexed.filePath !== newFilePath) {
            const absoluteOldPath = join(context.vaultPath, "aspects", indexed.filePath);
            await unlink(absoluteOldPath).catch((error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") {
                log.warn(
                  { filePath: indexed.filePath },
                  "rename cleanup: old aspect file already gone",
                );
                return;
              }
              throw error;
            });
          }

          const absolutePath = join(context.vaultPath, "aspects", newFilePath);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          const cascadePayload =
            patch.key !== undefined && patch.key !== oldKey
              ? await cascadeAspectKeyRename(context, oldKey, updated.key)
              : null;

          const warningFragments = cascadePayload?.fragments ?? [];

          vaultDatabase.transaction((tx) => {
            cascadePayload?.commit(tx);
            upsertAspect(tx, updated, newFilePath, rawContent);
          });

          return { aspect: updated, warnings: warningFragments };
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
        const allNotes = await getVaultIndexer(context).notes.findAll();
        const lowerKey = note.key.toLowerCase();
        if (allNotes.some((n) => n.uuid !== note.uuid && n.key.toLowerCase() === lowerKey)) {
          throw new VaultError("KEY_CONFLICT", `A note with key "${note.key}" already exists`, {
            reason: "key_conflict",
          });
        }

        await getVault(context).notes.write(note);

        // Inline DB update — closes the stale-index window for API-originated writes.
        const entityRelativePath = `${note.key}.md`;
        const absolutePath = join(context.vaultPath, "notes", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const vaultDatabase = getVaultDatabase(context);

        vaultDatabase.transaction((tx) => {
          upsertNote(tx, note, entityRelativePath, rawContent);
        });
      },

      async update(
        context: ProjectContext,
        uuid: string,
        patch: NoteUpdate,
      ): Promise<NoteUpdateResponse> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.notes.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Note "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        try {
          const current = await getVault(context).notes.read(indexed.filePath);
          const oldKey = current.key;
          const updated: Note = {
            ...current,
            ...(patch.key !== undefined && { key: patch.key }),
            ...(patch.content !== undefined && { content: patch.content }),
          };

          await getVault(context).notes.write(updated);

          const newFilePath = `${updated.key}.md`;

          if (indexed.filePath !== newFilePath) {
            const absoluteOldPath = join(context.vaultPath, "notes", indexed.filePath);
            await unlink(absoluteOldPath).catch((error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") {
                log.warn(
                  { filePath: indexed.filePath },
                  "rename cleanup: old note file already gone",
                );
                return;
              }
              throw error;
            });
          }

          const absolutePath = join(context.vaultPath, "notes", newFilePath);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          const cascadePayload =
            patch.key !== undefined && patch.key !== oldKey
              ? await cascadeNoteKeyRename(context, oldKey, updated.key)
              : null;

          const warnings = cascadePayload
            ? { fragments: cascadePayload.fragments, aspects: cascadePayload.aspects }
            : { fragments: [], aspects: [] };

          vaultDatabase.transaction((tx) => {
            cascadePayload?.commit(tx);
            upsertNote(tx, updated, newFilePath, rawContent);
          });

          return { note: updated, warnings };
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

        const vaultDatabase = getVaultDatabase(context);
        vaultDatabase.transaction((tx) => {
          deleteNoteByFilePath(tx, indexed.filePath);
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
        const allReferences = await getVaultIndexer(context).references.findAll();
        const lowerKey = reference.key.toLowerCase();
        if (
          allReferences.some((r) => r.uuid !== reference.uuid && r.key.toLowerCase() === lowerKey)
        ) {
          throw new VaultError(
            "KEY_CONFLICT",
            `A reference with key "${reference.key}" already exists`,
            { reason: "key_conflict" },
          );
        }

        await getVault(context).references.write(reference);

        // Inline DB update — closes the stale-index window for API-originated writes.
        const entityRelativePath = `${reference.key}.md`;
        const absolutePath = join(context.vaultPath, "references", entityRelativePath);
        const rawContent = await Bun.file(absolutePath).text();
        const vaultDatabase = getVaultDatabase(context);

        vaultDatabase.transaction((tx) => {
          upsertReference(tx, reference, entityRelativePath, rawContent);
        });
      },

      async update(
        context: ProjectContext,
        uuid: string,
        patch: ReferenceUpdate,
      ): Promise<ReferenceUpdateResponse> {
        const indexer = getVaultIndexer(context);
        const indexed = await indexer.references.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("ENTITY_NOT_FOUND", `Reference "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        try {
          const current = await getVault(context).references.read(indexed.filePath);
          const oldKey = current.key;
          const updated: Reference = {
            ...current,
            ...(patch.key !== undefined && { key: patch.key }),
            ...(patch.content !== undefined && { content: patch.content }),
          };

          await getVault(context).references.write(updated);

          const newFilePath = `${updated.key}.md`;

          if (indexed.filePath !== newFilePath) {
            const absoluteOldPath = join(context.vaultPath, "references", indexed.filePath);
            await unlink(absoluteOldPath).catch((error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") {
                log.warn(
                  { filePath: indexed.filePath },
                  "rename cleanup: old reference file already gone",
                );
                return;
              }
              throw error;
            });
          }

          const absolutePath = join(context.vaultPath, "references", newFilePath);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          const cascadePayload =
            patch.key !== undefined && patch.key !== oldKey
              ? await cascadeReferenceKeyRename(context, oldKey, updated.key)
              : null;

          const warnings = cascadePayload ? { fragments: cascadePayload.fragments } : { fragments: [] };

          vaultDatabase.transaction((tx) => {
            cascadePayload?.commit(tx);
            upsertReference(tx, updated, newFilePath, rawContent);
          });

          return { reference: updated, warnings };
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

        const vaultDatabase = getVaultDatabase(context);
        vaultDatabase.transaction((tx) => {
          deleteReferenceByFilePath(tx, indexed.filePath);
        });
      },
    },

    // Arc operations (vault-stored, not DB-indexed)

    arcs: {
      read: readArc,
      write: writeArc,
      delete: deleteArc,
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
