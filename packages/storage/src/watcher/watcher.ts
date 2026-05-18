import chokidar from "chokidar";
import path from "node:path";
import type { Logger, VaultSyncEvent, Aspect, Note, Reference } from "@maskor/shared";
import type { VaultDatabase } from "../db/vault";
import { aspectsTable, notesTable, referencesTable } from "../db/vault/schema";
import type { Vault } from "../vault/types";
import * as aspectMapper from "../vault/markdown/mappers/aspect";
import * as noteMapper from "../vault/markdown/mappers/note";
import * as referenceMapper from "../vault/markdown/mappers/reference";
import {
  upsertAspect,
  upsertNote,
  upsertReference,
  deleteAspectByFilePath,
  deleteNoteByFilePath,
  deleteReferenceByFilePath,
} from "../indexer/upserts";
import { eq } from "drizzle-orm";
import { createRenameBuffer } from "./utils/rename-buffer";
import { createInFlightTracker } from "./utils/in-flight-tracker";
import type { CascadeCallbacks, VaultWatcher } from "./types";
import {
  FRAGMENT_PREFIX,
  ASPECT_PREFIX,
  NOTE_PREFIX,
  REFERENCE_PREFIX,
  PIECE_PREFIX,
} from "./utils/constants";
import { createChokidarConfig } from "./chokidar-config";
import type { EntityConfig } from "./sync/keyed-entity";
import { syncKeyedEntity, unlinkKeyedEntity } from "./sync/keyed-entity";
import { syncFragment, unlinkFragment } from "./sync/fragment";
import { syncPieces } from "./sync/pieces";

type Route = {
  prefix: string;
  handleAddOrChange: (absolutePath: string, vaultRelativePath: string) => Promise<void>;
  handleUnlink: (vaultRelativePath: string) => void;
};

export type VaultWatcherEmit = (event: VaultSyncEvent) => void;

export const createVaultWatcher = (
  vaultDatabase: VaultDatabase,
  vault: Vault,
  emit: VaultWatcherEmit,
  logger?: Logger,
  cascadeCallbacks?: CascadeCallbacks,
): VaultWatcher => {
  const vaultRoot = vault.root;

  const log: Logger =
    logger?.child({ module: "watcher" }) ??
    ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => log,
    } as unknown as Logger);

  let watcher: ReturnType<typeof chokidar.watch> | null = null;
  let isPaused = false;
  const inFlight = createInFlightTracker();

  const noteRenameBuffer = createRenameBuffer();
  const referenceRenameBuffer = createRenameBuffer();
  const aspectRenameBuffer = createRenameBuffer();

  // --- entity configs ---

  const aspectConfig: EntityConfig<Aspect> = {
    label: "aspect",
    renameBuffer: aspectRenameBuffer,
    fromFile: aspectMapper.fromFile,
    upsert: upsertAspect,
    deleteByFilePath: deleteAspectByFilePath,
    cascadeRename: cascadeCallbacks?.onAspectRename,
    queryStoredRow: (uuid) =>
      vaultDatabase
        .select({ key: aspectsTable.key, contentHash: aspectsTable.contentHash })
        .from(aspectsTable)
        .where(eq(aspectsTable.uuid, uuid))
        .get(),
    queryRowByFilePath: (filePath) =>
      vaultDatabase
        .select({ uuid: aspectsTable.uuid, key: aspectsTable.key })
        .from(aspectsTable)
        .where(eq(aspectsTable.filePath, filePath))
        .get(),
    syncedEventType: "aspect:synced",
    deletedEventType: "aspect:deleted",
    emit,
  };

  const noteConfig: EntityConfig<Note> = {
    label: "note",
    renameBuffer: noteRenameBuffer,
    fromFile: noteMapper.fromFile,
    upsert: upsertNote,
    deleteByFilePath: deleteNoteByFilePath,
    cascadeRename: cascadeCallbacks?.onNoteRename,
    queryStoredRow: (uuid) =>
      vaultDatabase
        .select({ key: notesTable.key, contentHash: notesTable.contentHash })
        .from(notesTable)
        .where(eq(notesTable.uuid, uuid))
        .get(),
    queryRowByFilePath: (filePath) =>
      vaultDatabase
        .select({ uuid: notesTable.uuid, key: notesTable.key })
        .from(notesTable)
        .where(eq(notesTable.filePath, filePath))
        .get(),
    syncedEventType: "note:synced",
    deletedEventType: "note:deleted",
    emit,
  };

  const referenceConfig: EntityConfig<Reference> = {
    label: "reference",
    renameBuffer: referenceRenameBuffer,
    fromFile: referenceMapper.fromFile,
    upsert: upsertReference,
    deleteByFilePath: deleteReferenceByFilePath,
    cascadeRename: cascadeCallbacks?.onReferenceRename,
    queryStoredRow: (uuid) =>
      vaultDatabase
        .select({ key: referencesTable.key, contentHash: referencesTable.contentHash })
        .from(referencesTable)
        .where(eq(referencesTable.uuid, uuid))
        .get(),
    queryRowByFilePath: (filePath) =>
      vaultDatabase
        .select({ uuid: referencesTable.uuid, key: referencesTable.key })
        .from(referencesTable)
        .where(eq(referencesTable.filePath, filePath))
        .get(),
    syncedEventType: "reference:synced",
    deletedEventType: "reference:deleted",
    emit,
  };

  // --- routing table ---

  // Aspects checked before fragments to match documented event processing order.
  const routes: Route[] = [
    {
      prefix: ASPECT_PREFIX,
      handleAddOrChange: (absolutePath, vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(ASPECT_PREFIX.length);
        return syncKeyedEntity(aspectConfig, vaultDatabase, log, absolutePath, entityRelativePath);
      },
      handleUnlink: (vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(ASPECT_PREFIX.length);
        unlinkKeyedEntity(aspectConfig, vaultDatabase, entityRelativePath);
      },
    },
    {
      prefix: FRAGMENT_PREFIX,
      handleAddOrChange: (absolutePath, vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(FRAGMENT_PREFIX.length);
        return syncFragment(vaultDatabase, emit, log, absolutePath, entityRelativePath);
      },
      handleUnlink: (vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(FRAGMENT_PREFIX.length);
        unlinkFragment(vaultDatabase, emit, entityRelativePath);
      },
    },
    {
      prefix: NOTE_PREFIX,
      handleAddOrChange: (absolutePath, vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(NOTE_PREFIX.length);
        return syncKeyedEntity(noteConfig, vaultDatabase, log, absolutePath, entityRelativePath);
      },
      handleUnlink: (vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(NOTE_PREFIX.length);
        unlinkKeyedEntity(noteConfig, vaultDatabase, entityRelativePath);
      },
    },
    {
      prefix: REFERENCE_PREFIX,
      handleAddOrChange: (absolutePath, vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(REFERENCE_PREFIX.length);
        return syncKeyedEntity(
          referenceConfig,
          vaultDatabase,
          log,
          absolutePath,
          entityRelativePath,
        );
      },
      handleUnlink: (vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(REFERENCE_PREFIX.length);
        unlinkKeyedEntity(referenceConfig, vaultDatabase, entityRelativePath);
      },
    },
    {
      prefix: PIECE_PREFIX,
      handleAddOrChange: (_absolutePath, vaultRelativePath) => {
        const pieceFileName = vaultRelativePath.slice(PIECE_PREFIX.length);
        return syncPieces(vaultDatabase, vault, emit, log, pieceFileName);
      },
      handleUnlink: (_vaultRelativePath) => {
        // Pieces are consumed and removed by vault.pieces.consume — no unlink handling.
      },
    },
  ];

  // --- chokidar event handlers ---

  const handleAddOrChange = async (absolutePath: string): Promise<void> => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) return;
    log.info({ filePath: absolutePath }, "watcher: add or change");

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);
    const route = routes.find((r) => vaultRelativePath.startsWith(r.prefix));
    if (!route) return;

    inFlight.enter();
    try {
      await route.handleAddOrChange(absolutePath, vaultRelativePath);
    } catch (error) {
      log.error(
        {
          filePath: absolutePath,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "watcher: unhandled error processing add/change event — skipping",
      );
    } finally {
      inFlight.exit();
    }
  };

  const handleUnlink = async (absolutePath: string): Promise<void> => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) return;

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);
    const route = routes.find((r) => vaultRelativePath.startsWith(r.prefix));
    if (!route) return;

    inFlight.enter();
    try {
      route.handleUnlink(vaultRelativePath);
      log.debug({ filePath: absolutePath }, "watcher: entity unlink handled");
    } catch (error) {
      log.error(
        {
          filePath: absolutePath,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "watcher: unhandled error processing unlink event — skipping",
      );
    } finally {
      inFlight.exit();
    }
  };

  return {
    start() {
      if (watcher) return; // idempotent

      const { watched, ...chokidarOptions } = createChokidarConfig(vaultRoot);
      watcher = chokidar.watch(watched, chokidarOptions);

      watcher.on("add", handleAddOrChange);
      watcher.on("change", handleAddOrChange);
      watcher.on("unlink", handleUnlink);

      watcher.on("error", (error) => {
        log.error(
          { errorMessage: error instanceof Error ? error.message : String(error) },
          "watcher: chokidar error",
        );
      });

      log.info({ vaultRoot }, "watcher: started");
    },

    async stop() {
      if (!watcher) return;
      noteRenameBuffer.drainAll();
      referenceRenameBuffer.drainAll();
      aspectRenameBuffer.drainAll();
      await watcher.close();
      watcher = null;
      log.info({ vaultRoot }, "watcher: stopped");
    },

    async pause() {
      isPaused = true;
      await inFlight.wait();
    },

    resume() {
      isPaused = false;
    },

    emit(event: VaultSyncEvent): void {
      emit(event);
    },
  };
};
