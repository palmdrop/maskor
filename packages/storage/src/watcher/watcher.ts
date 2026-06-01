import chokidar from "chokidar";
import path from "node:path";
import type { VaultSyncEvent, Aspect, Note, Reference } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { VaultDatabase } from "../db/vault";
import { aspectsTable, notesTable, referencesTable } from "../db/vault/schema";
import type { Vault } from "../vault/types";
import { VaultError } from "../vault/types";
import type { EntityKind } from "../indexer/types";
import * as aspectMapper from "../vault/markdown/mappers/aspect";
import * as noteMapper from "../vault/markdown/mappers/note";
import * as referenceMapper from "../vault/markdown/mappers/reference";
import {
  loadKnownAspectKeys,
  upsertAspect,
  upsertNote,
  upsertReference,
  deleteAspectByFilePath,
  deleteNoteByFilePath,
  deleteReferenceByFilePath,
} from "../indexer/upserts";
import { insertWarning, deleteStateWarningByKey } from "../warnings/warnings-repo";
import { reconcileUnknownAspectKeyWarnings } from "../warnings/reconcile";
import { eq } from "drizzle-orm";
import { createRenameBuffer } from "./utils/rename-buffer";
import { createInFlightTracker } from "./utils/in-flight-tracker";
import { createRecentlyDeletedTracker } from "./utils/recently-deleted";
import type { CascadeCallbacks, VaultWatcher } from "./types";
import {
  FRAGMENT_PREFIX,
  ASPECT_PREFIX,
  NOTE_PREFIX,
  REFERENCE_PREFIX,
  MARGIN_PREFIX,
} from "./utils/constants";
import { createChokidarConfig } from "./chokidar-config";
import type { EntityConfig } from "./sync/keyed-entity";
import { syncKeyedEntity, unlinkKeyedEntity } from "./sync/keyed-entity";
import { syncFragment, unlinkFragment } from "./sync/fragment";
import { syncMargin, unlinkMargin } from "./sync/margin";

type Route = {
  prefix: string;
  entityKind: EntityKind;
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

  const aspectRecentlyDeleted = createRecentlyDeletedTracker();
  const noteRecentlyDeleted = createRecentlyDeletedTracker();
  const referenceRecentlyDeleted = createRecentlyDeletedTracker();

  // Reconcile UNKNOWN_ASPECT_KEY warnings for a single aspect key after the aspects table changed
  // (an aspect was created — key now known — or deleted — key now unknown). Reads the fresh known
  // set so the membership check reflects the committed state.
  const reconcileAspectKey = (aspectKey: string): void => {
    const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);
    if (reconcileUnknownAspectKeyWarnings(vaultDatabase, [aspectKey], knownAspectKeys)) {
      emit({ type: "vault:warning" });
    }
  };

  // --- entity configs ---

  const aspectConfig: EntityConfig<Aspect> = {
    label: "aspect",
    renameBuffer: aspectRenameBuffer,
    recentlyDeleted: aspectRecentlyDeleted,
    fromFile: aspectMapper.fromFile,
    upsert: upsertAspect,
    deleteByFilePath: deleteAspectByFilePath,
    cascadeRename: cascadeCallbacks?.onAspectRename,
    queryStoredRow: (uuid) =>
      vaultDatabase
        .select({
          key: aspectsTable.key,
          contentHash: aspectsTable.contentHash,
          filePath: aspectsTable.filePath,
        })
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
    onSynced: (aspect) => reconcileAspectKey(aspect.key),
    onDeleted: (deletedKey) => reconcileAspectKey(deletedKey),
  };

  const noteConfig: EntityConfig<Note> = {
    label: "note",
    renameBuffer: noteRenameBuffer,
    recentlyDeleted: noteRecentlyDeleted,
    fromFile: noteMapper.fromFile,
    upsert: upsertNote,
    deleteByFilePath: deleteNoteByFilePath,
    cascadeRename: cascadeCallbacks?.onNoteRename,
    queryStoredRow: (uuid) =>
      vaultDatabase
        .select({
          key: notesTable.key,
          contentHash: notesTable.contentHash,
          filePath: notesTable.filePath,
        })
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
    recentlyDeleted: referenceRecentlyDeleted,
    fromFile: referenceMapper.fromFile,
    upsert: upsertReference,
    deleteByFilePath: deleteReferenceByFilePath,
    cascadeRename: cascadeCallbacks?.onReferenceRename,
    queryStoredRow: (uuid) =>
      vaultDatabase
        .select({
          key: referencesTable.key,
          contentHash: referencesTable.contentHash,
          filePath: referencesTable.filePath,
        })
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
      entityKind: "aspect",
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
      entityKind: "fragment",
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
      entityKind: "note",
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
      entityKind: "reference",
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
      prefix: MARGIN_PREFIX,
      entityKind: "margin",
      handleAddOrChange: (absolutePath, vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(MARGIN_PREFIX.length);
        return syncMargin(vaultDatabase, vaultRoot, emit, log, absolutePath, entityRelativePath);
      },
      handleUnlink: (vaultRelativePath) => {
        const entityRelativePath = vaultRelativePath.slice(MARGIN_PREFIX.length);
        unlinkMargin(vaultDatabase, emit, entityRelativePath);
      },
    },
  ];

  // --- chokidar event handlers ---

  // True when the path sits under an entity folder (fragments/aspects/notes/references).
  // Chokidar already filters dotfiles, so any non-`.md` path matching a route is a wrong-format
  // file the user dropped in by mistake.
  const matchesEntityRoute = (vaultRelativePath: string): boolean =>
    routes.some((route) => vaultRelativePath.startsWith(route.prefix));

  // Vault-root-relative, forward-slash key — matches the keys produced by the rebuild scan
  // (warnings/wrong-format.ts) so add/unlink reconcile against the same row.
  const toWarningKey = (vaultRelativePath: string): string =>
    vaultRelativePath.split(path.sep).join("/");

  const handleAddOrChange = async (
    absolutePath: string,
    eventType: "add" | "change",
  ): Promise<void> => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) {
      // A wrong-format file is flagged once, on `add`. Editing an already-flagged file fires
      // `change` and needs no new row — skip it to avoid redundant upserts and `vault:warning`
      // churn. Pre-existing wrong-format files are caught by the rebuild scan instead.
      if (eventType === "change") return;
      const vaultRelativePath = path.relative(vaultRoot, absolutePath);
      if (!matchesEntityRoute(vaultRelativePath)) return;
      // Routed through inFlight + try/catch like the .md path so pause()/stop() drains it and a
      // late teardown event (DB file already gone) logs rather than throwing an unhandled error.
      inFlight.enter();
      try {
        insertWarning(vaultDatabase, {
          kind: "WRONG_FORMAT_FILE",
          filePath: toWarningKey(vaultRelativePath),
        });
        emit({ type: "vault:warning" });
        log.warn({ filePath: vaultRelativePath }, "watcher: wrong-format file in entity folder");
      } catch (error) {
        log.error(
          {
            filePath: absolutePath,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          "watcher: unhandled error recording wrong-format warning — skipping",
        );
      } finally {
        inFlight.exit();
      }
      return;
    }
    log.info({ filePath: absolutePath }, "watcher: add or change");

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);
    const route = routes.find((r) => vaultRelativePath.startsWith(r.prefix));
    if (!route) return;

    inFlight.enter();
    try {
      await route.handleAddOrChange(absolutePath, vaultRelativePath);
      // Parsed and synced (or unchanged) — clear any stale INVALID_ENTITY_FILE warning for this
      // file. Rebuild remains authoritative; this is best-effort incremental upkeep.
      if (
        deleteStateWarningByKey(
          vaultDatabase,
          "INVALID_ENTITY_FILE",
          toWarningKey(vaultRelativePath),
        )
      ) {
        emit({ type: "vault:warning" });
      }
    } catch (error) {
      // A malformed file throws VaultError("INVALID_ENTITY_FILE") from the parse step (before any
      // writeback). Record it as a state warning instead of a generic error log; the file stays on
      // disk untouched and the warning clears once the user fixes it.
      if (error instanceof VaultError && error.code === "INVALID_ENTITY_FILE") {
        insertWarning(vaultDatabase, {
          kind: "INVALID_ENTITY_FILE",
          filePath: toWarningKey(vaultRelativePath),
          entityKind: route.entityKind,
          error: error.context.reason ?? error.message,
        });
        emit({ type: "vault:warning" });
        log.warn(
          { filePath: vaultRelativePath },
          "watcher: invalid entity file — recorded warning, skipping",
        );
      } else {
        log.error(
          {
            filePath: absolutePath,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          "watcher: unhandled error processing add/change event — skipping",
        );
      }
    } finally {
      inFlight.exit();
    }
  };

  const handleUnlink = async (absolutePath: string): Promise<void> => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) {
      const vaultRelativePath = path.relative(vaultRoot, absolutePath);
      if (!matchesEntityRoute(vaultRelativePath)) return;
      inFlight.enter();
      try {
        if (
          deleteStateWarningByKey(
            vaultDatabase,
            "WRONG_FORMAT_FILE",
            toWarningKey(vaultRelativePath),
          )
        ) {
          emit({ type: "vault:warning" });
        }
      } catch (error) {
        log.error(
          {
            filePath: absolutePath,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          "watcher: unhandled error clearing wrong-format warning — skipping",
        );
      } finally {
        inFlight.exit();
      }
      return;
    }

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);
    const route = routes.find((r) => vaultRelativePath.startsWith(r.prefix));
    if (!route) return;

    inFlight.enter();
    try {
      route.handleUnlink(vaultRelativePath);
      // A removed file can no longer be invalid — clear any INVALID_ENTITY_FILE warning for it.
      if (
        deleteStateWarningByKey(
          vaultDatabase,
          "INVALID_ENTITY_FILE",
          toWarningKey(vaultRelativePath),
        )
      ) {
        emit({ type: "vault:warning" });
      }
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

      watcher.on("add", (changedPath) => handleAddOrChange(changedPath, "add"));
      watcher.on("change", (changedPath) => handleAddOrChange(changedPath, "change"));
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
