import path from "node:path";
import type { VaultSyncEvent } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { VaultDatabase } from "../../db/vault";
import type { ParsedFile } from "../../vault/markdown/parse";
import { parseFile } from "../../vault/markdown/parse";
import type { Transaction } from "../../indexer/upserts";
import type { RenameBuffer } from "../utils/rename-buffer";
import type { RecentlyDeletedTracker } from "../utils/recently-deleted";
import { hashContent } from "../../utils/hash";
import { ensureUuid } from "../../vault/markdown/adopt";
import { readFileWithEnoentGuard } from "../utils/file";

// EntityConfig is an implementation detail of the sync layer, not the public watcher interface.
export type EntityConfig<TEntity extends { uuid: string; key: string }> = {
  label: string;
  renameBuffer: RenameBuffer;
  recentlyDeleted: RecentlyDeletedTracker;
  fromFile: (parsed: ParsedFile, entityRelativePath: string) => TEntity;
  upsert: (tx: Transaction, entity: TEntity, filePath: string, rawContent: string) => void;
  deleteByFilePath: (tx: Transaction, filePath: string) => void;
  cascadeRename?: (oldKey: string, newKey: string) => Promise<void>;
  // Query by UUID — used for hash guard, DB-rename detection, and move detection.
  queryStoredRow: (
    uuid: string,
  ) => { key: string; contentHash: string; filePath: string } | undefined;
  // Query by filePath — used by unlink to populate the rename buffer.
  queryRowByFilePath: (filePath: string) => { uuid: string; key: string } | undefined;
  syncedEventType: "aspect:synced" | "note:synced" | "reference:synced";
  deletedEventType: "aspect:deleted" | "note:deleted" | "reference:deleted";
  emit: (event: VaultSyncEvent) => void;
  // Optional post-commit hooks. Aspects use these to reconcile UNKNOWN_ASPECT_KEY warnings when a
  // key becomes known (onSynced) or unknown (onDeleted); notes/references leave them unset.
  onSynced?: (entity: TEntity) => void;
  onDeleted?: (deletedKey: string) => void;
};

export const syncKeyedEntity = async <TEntity extends { uuid: string; key: string }>(
  config: EntityConfig<TEntity>,
  vaultDatabase: VaultDatabase,
  log: Logger,
  absolutePath: string,
  entityRelativePath: string,
): Promise<void> => {
  const rawContentOrNull = await readFileWithEnoentGuard(absolutePath, config.label, log);
  if (rawContentOrNull === null) return;

  const parsed = parseFile(rawContentOrNull);
  const { uuid, rawContent } = await ensureUuid(
    parsed,
    absolutePath,
    rawContentOrNull,
    log,
    config.label,
  );

  const filenameKey = path.basename(entityRelativePath, ".md");
  const renameCheck = config.renameBuffer.check(uuid, filenameKey);

  if (renameCheck?.kind === "collision") {
    vaultDatabase.transaction((tx) => {
      config.deleteByFilePath(tx, renameCheck.filePath);
    });
    config.emit({ type: config.deletedEventType, filePath: renameCheck.filePath });
  }

  const isBufferRename = renameCheck?.kind === "rename";
  // Cascade only when the key actually changed. A pure folder move keeps the
  // same key, so fragment frontmatter does not need rewriting.
  if (isBufferRename && renameCheck.oldKey !== filenameKey && config.cascadeRename) {
    await config.cascadeRename(renameCheck.oldKey, filenameKey);
  }

  // DB lookup only when no buffer rename was detected — needed for hash guard,
  // DB-rename detection (Maskor-internal rename after a rebuild), and move
  // detection (filePath changed but hash and key are unchanged).
  if (!isBufferRename) {
    const storedRow = config.queryStoredRow(uuid);
    const isDbRename = storedRow !== undefined && storedRow.key !== filenameKey;

    if (isDbRename && config.cascadeRename) {
      await config.cascadeRename(storedRow.key, filenameKey);
    }

    if (!isDbRename && storedRow !== undefined) {
      const hashMatches = storedRow.contentHash === hashContent(rawContent);
      const pathMatches = storedRow.filePath === entityRelativePath;
      if (hashMatches && pathMatches) {
        log.debug(
          { filePath: entityRelativePath },
          `watcher: ${config.label} unchanged (hash match) — skipping`,
        );
        return;
      }
      if (hashMatches && !pathMatches) {
        log.debug(
          { filePath: entityRelativePath, oldFilePath: storedRow.filePath },
          `watcher: ${config.label} moved — updating filePath, no cascade`,
        );
      }
    }
  }

  const entity = config.fromFile(parsed, entityRelativePath);

  vaultDatabase.transaction((tx) => {
    config.upsert(tx, entity, entityRelativePath, rawContent);
  });

  config.onSynced?.(entity);

  // A returning entity: the UUID was deleted from this entity-type's table
  // recently (within the tracker's TTL) and is now back. The flag rides on the
  // synced event so action-log consumers and observability tooling can
  // distinguish "this file returned" from "this is a fresh file."
  //
  // Cross-entity-type return note: the recently-deleted tracker is per
  // entity-type and per watcher instance. When a file moves across entity-type
  // roots (e.g. aspects/x.md → notes/x.md) within the rename-buffer window,
  // the destination upserts immediately while the source row sticks around
  // until the source-side rename-buffer expires. Both rows can hold the same
  // UUID for up to ~RENAME_BUFFER_MS — UUID uniqueness across entity-type
  // tables is *not* an invariant during that window. See ADR-0002.
  const revived = config.recentlyDeleted.consume(uuid);

  config.emit({ type: config.syncedEventType, uuid, ...(revived ? { revived: true } : {}) });
  log.debug(
    { filePath: entityRelativePath, revived },
    revived
      ? `watcher: ${config.label} revived after recent deletion`
      : `watcher: ${config.label} synced`,
  );
};

export const unlinkKeyedEntity = <TEntity extends { uuid: string; key: string }>(
  config: EntityConfig<TEntity>,
  vaultDatabase: VaultDatabase,
  entityRelativePath: string,
): void => {
  const storedRow = config.queryRowByFilePath(entityRelativePath);
  if (!storedRow) return;

  // The deletion commit is deferred ~RENAME_BUFFER_MS so a following add can be
  // recognised as a rename instead. That deferral makes watcher lifetime
  // load-bearing: if the vault directory is deleted out from under a live
  // watcher (e.g. a test rm-ing its temp dir without calling
  // storageService.shutdown()), this timer still fires and runs the
  // transaction below against a vanished directory. On Linux the open
  // bun:sqlite inode survives but SQLite cannot create its journal/WAL sidecar
  // in the gone directory, so the write fails with "attempt to write a
  // readonly database". macOS FSEvents coalesces the subtree delete and rarely
  // delivers the per-file unlink, so the timer is usually never scheduled there
  // — which is why a leaked watcher fails the Linux suite but passes on macOS.
  // Always stop the watcher before removing its vault. See
  // service/storage-service.ts `shutdown()`.
  config.renameBuffer.add(storedRow.uuid, storedRow.key, entityRelativePath, () => {
    vaultDatabase.transaction((tx) => {
      config.deleteByFilePath(tx, entityRelativePath);
    });
    config.recentlyDeleted.record(storedRow.uuid);
    config.emit({ type: config.deletedEventType, filePath: entityRelativePath });
    // Fires only when the deletion actually commits — a rename cancels this callback, so an
    // aspect's key disappearing here is genuine and may now leave fragments referencing it.
    config.onDeleted?.(storedRow.key);
  });
};
