import chokidar from "chokidar";
import path from "node:path";
import type { Logger, VaultSyncEvent } from "@maskor/shared";
import type { VaultDatabase } from "../db/vault";
import { aspectsTable, fragmentsTable, notesTable, referencesTable } from "../db/vault/schema";
import type { Vault } from "../vault/types";
import { parseFile } from "../vault/markdown/parse";
import { serializeFile } from "../vault/markdown/serialize";
import * as fragmentMapper from "../vault/markdown/mappers/fragment";
import * as aspectMapper from "../vault/markdown/mappers/aspect";
import * as noteMapper from "../vault/markdown/mappers/note";
import * as referenceMapper from "../vault/markdown/mappers/reference";
import { hashContent } from "../utils/hash";
import {
  loadKnownAspectKeys,
  upsertAspect,
  upsertFragment,
  upsertNote,
  upsertReference,
  deleteFragmentByFilePath,
  deleteAspectByFilePath,
  deleteNoteByFilePath,
  deleteReferenceByFilePath,
} from "../indexer/upserts";
import { eq } from "drizzle-orm";
import { findFragmentUuidCollision } from "./utils/fragments";
import { createRenameBuffer } from "./utils/rename-buffer";
import type { CascadeCallbacks, VaultWatcher } from "./types";
import { toEntityRelativePath } from "./utils/paths";

export const createVaultWatcher = (
  vaultDatabase: VaultDatabase,
  vault: Vault,
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

  const subscribers = new Set<(event: VaultSyncEvent) => void>();

  const noteRenameBuffer = createRenameBuffer();
  const referenceRenameBuffer = createRenameBuffer();
  const aspectRenameBuffer = createRenameBuffer();

  const emit = (event: VaultSyncEvent): void => {
    for (const callback of subscribers) {
      callback(event);
    }
  };

  // --- per-entity sync handlers ---

  // TODO: Lots of code duplication in the sync functions. Generalize, move parts to watcher/utils/sync.ts
  const syncFragment = async (absolutePath: string, entityRelativePath: string): Promise<void> => {
    let rawContent: string;
    try {
      rawContent = await Bun.file(absolutePath).text();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log.warn(
          { filePath: absolutePath },
          "watcher: file removed before read (fragment) — skipping",
        );
        return;
      }
      throw error;
    }

    const parsed = parseFile(rawContent);
    let uuid = parsed.frontmatter.uuid as string | undefined;

    // UUID write-back: assign UUID if missing, or resolve collision.
    if (!uuid) {
      uuid = crypto.randomUUID();
      parsed.frontmatter.uuid = uuid;
      const rewritten = serializeFile({
        frontmatter: parsed.frontmatter,
        inlineFields: parsed.inlineFields,
        body: parsed.body,
      });
      await Bun.write(absolutePath, rewritten);
      // rawContent is now stale; re-read so the stored hash reflects the rewritten file.
      rawContent = rewritten;
      log.debug({ filePath: entityRelativePath, uuid }, "watcher: UUID written back to fragment");
    } else {
      const collision = findFragmentUuidCollision(vaultDatabase, uuid, entityRelativePath);
      if (collision) {
        uuid = crypto.randomUUID();
        parsed.frontmatter.uuid = uuid;
        const rewritten = serializeFile({
          frontmatter: parsed.frontmatter,
          inlineFields: parsed.inlineFields,
          body: parsed.body,
        });
        await Bun.write(absolutePath, rewritten);
        rawContent = rewritten;
        log.warn(
          { filePath: entityRelativePath, collidingPath: collision, newUuid: uuid },
          "watcher: UUID collision resolved — new UUID assigned",
        );
      }
    }

    // Hash guard: skip if full-file content unchanged.
    const storedRow = vaultDatabase
      .select({ contentHash: fragmentsTable.contentHash })
      .from(fragmentsTable)
      .where(eq(fragmentsTable.uuid, uuid))
      .get();
    if (storedRow?.contentHash === hashContent(rawContent)) {
      log.debug(
        { filePath: entityRelativePath },
        "watcher: fragment unchanged (hash match) — skipping",
      );
      return;
    }

    const fragment = fragmentMapper.fromFile(parsed, entityRelativePath);
    const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

    const warnings = vaultDatabase.transaction((tx) => {
      return upsertFragment(tx, fragment, entityRelativePath, rawContent, knownAspectKeys);
    });

    emit({ type: "fragment:synced", uuid });

    for (const warning of warnings) {
      log.warn(
        { aspectKey: warning.aspectKey, fragmentUuids: warning.fragmentUuids },
        "watcher: unknown aspect key on fragment sync",
      );
    }

    log.debug({ filePath: entityRelativePath }, "watcher: fragment synced");
  };

  const syncAspect = async (absolutePath: string, entityRelativePath: string): Promise<void> => {
    let rawContent: string;
    try {
      rawContent = await Bun.file(absolutePath).text();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log.warn(
          { filePath: absolutePath },
          "watcher: file removed before read (aspect) — skipping",
        );
        return;
      }
      throw error;
    }

    const parsed = parseFile(rawContent);
    let uuid = parsed.frontmatter.uuid as string | undefined;

    if (!uuid) {
      uuid = crypto.randomUUID();
      parsed.frontmatter.uuid = uuid;
      const rewritten = serializeFile({ frontmatter: parsed.frontmatter, body: parsed.body });
      await Bun.write(absolutePath, rewritten);
      rawContent = rewritten;
      log.debug({ filePath: entityRelativePath, uuid }, "watcher: UUID written back to aspect");
    }

    const filenameKey = path.basename(entityRelativePath, ".md");
    const renameCheck = aspectRenameBuffer.check(uuid, filenameKey);

    if (renameCheck?.kind === "collision") {
      vaultDatabase.transaction((tx) => {
        deleteAspectByFilePath(tx, renameCheck.filePath);
      });
      emit({ type: "aspect:deleted", filePath: renameCheck.filePath });
    }

    const bufferRename = renameCheck?.kind === "rename" ? renameCheck : null;

    if (bufferRename && cascadeCallbacks) {
      await cascadeCallbacks.onAspectRename(bufferRename.oldKey, filenameKey);
    }

    // DB lookup only when no buffer rename was detected — needed for hash guard and
    // as a fallback for edge cases (e.g. Maskor-internal rename after a rebuild).
    if (!bufferRename) {
      const storedRow = vaultDatabase
        .select({ key: aspectsTable.key, contentHash: aspectsTable.contentHash })
        .from(aspectsTable)
        .where(eq(aspectsTable.uuid, uuid))
        .get();

      const isDbRename = storedRow !== undefined && storedRow.key !== filenameKey;

      if (isDbRename && cascadeCallbacks) {
        await cascadeCallbacks.onAspectRename(storedRow.key, filenameKey);
      }

      if (!isDbRename && storedRow?.contentHash === hashContent(rawContent)) {
        log.debug(
          { filePath: entityRelativePath },
          "watcher: aspect unchanged (hash match) — skipping",
        );
        return;
      }
    }

    const aspect = aspectMapper.fromFile(parsed, entityRelativePath);

    vaultDatabase.transaction((tx) => {
      upsertAspect(tx, aspect, entityRelativePath, rawContent);
    });

    emit({ type: "aspect:synced", uuid });

    log.debug({ filePath: entityRelativePath }, "watcher: aspect synced");
  };

  const syncNote = async (absolutePath: string, entityRelativePath: string): Promise<void> => {
    let rawContent: string;
    try {
      rawContent = await Bun.file(absolutePath).text();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log.warn({ filePath: absolutePath }, "watcher: file removed before read (note) — skipping");
        return;
      }
      throw error;
    }

    const parsed = parseFile(rawContent);
    let uuid = parsed.frontmatter.uuid as string | undefined;

    if (!uuid) {
      uuid = crypto.randomUUID();
      parsed.frontmatter.uuid = uuid;
      const rewritten = serializeFile({ frontmatter: parsed.frontmatter, body: parsed.body });
      await Bun.write(absolutePath, rewritten);
      rawContent = rewritten;
      log.debug({ filePath: entityRelativePath, uuid }, "watcher: UUID written back to note");
    }

    const filenameKey = path.basename(entityRelativePath, ".md");
    const renameCheck = noteRenameBuffer.check(uuid, filenameKey);

    if (renameCheck?.kind === "collision") {
      vaultDatabase.transaction((tx) => {
        deleteNoteByFilePath(tx, renameCheck.filePath);
      });
      emit({ type: "note:deleted", filePath: renameCheck.filePath });
    } else if (cascadeCallbacks) {
      let oldKey: string | null = null;
      if (renameCheck?.kind === "rename") {
        oldKey = renameCheck.oldKey;
      } else {
        const storedRow = vaultDatabase
          .select({ key: notesTable.key })
          .from(notesTable)
          .where(eq(notesTable.uuid, uuid))
          .get();
        if (storedRow && storedRow.key !== filenameKey) {
          oldKey = storedRow.key;
        }
      }
      if (oldKey !== null) {
        await cascadeCallbacks.onNoteRename(oldKey, filenameKey);
      }
    }

    const note = noteMapper.fromFile(parsed, entityRelativePath);

    vaultDatabase.transaction((tx) => {
      upsertNote(tx, note, entityRelativePath, rawContent);
    });

    emit({ type: "note:synced", uuid });

    log.debug({ filePath: entityRelativePath }, "watcher: note synced");
  };

  const syncReference = async (absolutePath: string, entityRelativePath: string): Promise<void> => {
    let rawContent: string;
    try {
      rawContent = await Bun.file(absolutePath).text();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log.warn(
          { filePath: absolutePath },
          "watcher: file removed before read (reference) — skipping",
        );
        return;
      }
      throw error;
    }

    const parsed = parseFile(rawContent);
    let uuid = parsed.frontmatter.uuid as string | undefined;

    if (!uuid) {
      uuid = crypto.randomUUID();
      parsed.frontmatter.uuid = uuid;
      const rewritten = serializeFile({ frontmatter: parsed.frontmatter, body: parsed.body });
      await Bun.write(absolutePath, rewritten);
      rawContent = rewritten;
      log.debug({ filePath: entityRelativePath, uuid }, "watcher: UUID written back to reference");
    }

    const filenameKey = path.basename(entityRelativePath, ".md");
    const renameCheck = referenceRenameBuffer.check(uuid, filenameKey);

    if (renameCheck?.kind === "collision") {
      vaultDatabase.transaction((tx) => {
        deleteReferenceByFilePath(tx, renameCheck.filePath);
      });
      emit({ type: "reference:deleted", filePath: renameCheck.filePath });
    } else if (cascadeCallbacks) {
      let oldKey: string | null = null;
      if (renameCheck?.kind === "rename") {
        oldKey = renameCheck.oldKey;
      } else {
        const storedRow = vaultDatabase
          .select({ key: referencesTable.key })
          .from(referencesTable)
          .where(eq(referencesTable.uuid, uuid))
          .get();
        if (storedRow && storedRow.key !== filenameKey) {
          oldKey = storedRow.key;
        }
      }
      if (oldKey !== null) {
        await cascadeCallbacks.onReferenceRename(oldKey, filenameKey);
      }
    }

    const reference = referenceMapper.fromFile(parsed, entityRelativePath);

    vaultDatabase.transaction((tx) => {
      upsertReference(tx, reference, entityRelativePath, rawContent);
    });

    emit({ type: "reference:synced", uuid });

    log.debug({ filePath: entityRelativePath }, "watcher: reference synced");
  };

  const syncPieces = async (vaultRelativePath: string): Promise<void> => {
    const pieceFileName = vaultRelativePath.slice(PIECE_PREFIX.length);
    let fragment: Awaited<ReturnType<typeof vault.pieces.consume>>;
    try {
      fragment = await vault.pieces.consume(pieceFileName);
    } catch (error) {
      log.error(
        {
          filePath: pieceFileName,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "watcher: failed to consume piece",
      );
      return;
    }

    if (!fragment) return;

    const entityRelativePath = `${fragment.key}.md`;
    const absoluteFragmentPath = path.join(vaultRoot, "fragments", entityRelativePath);
    let rawContent: string;
    try {
      rawContent = await Bun.file(absoluteFragmentPath).text();
    } catch {
      log.warn(
        { filePath: absoluteFragmentPath },
        "watcher: could not read fragment written by consume — skipping upsert",
      );
      return;
    }

    const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

    const warnings = vaultDatabase.transaction((tx) => {
      return upsertFragment(tx, fragment, entityRelativePath, rawContent, knownAspectKeys);
    });

    emit({ type: "pieces:consumed", count: 1 });

    for (const warning of warnings) {
      log.warn(
        { aspectKey: warning.aspectKey, fragmentUuids: warning.fragmentUuids },
        "watcher: unknown aspect key on piece sync",
      );
    }

    log.debug({ pieceFile: pieceFileName }, "watcher: piece consumed and indexed");
  };

  // --- event routing ---

  // TODO: refactor this to global storage constants
  const FRAGMENT_PREFIX = "fragments" + path.sep;
  const ASPECT_PREFIX = "aspects" + path.sep;
  const NOTE_PREFIX = "notes" + path.sep;
  const REFERENCE_PREFIX = "references" + path.sep;
  const PIECE_PREFIX = "pieces" + path.sep;

  const handleAddOrChange = async (absolutePath: string): Promise<void> => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) return;
    log.info({ filePath: absolutePath }, "watcher: add or change");

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);

    // TODO: This is ugly. Lots of code duplication with only prefix and sync function differences
    // Aspects are checked before fragments to match documented event processing order.

    // TODO: should be able to use path to strip the first part, no need to use toEntityRelativePath everywhere... or just once. The vital thing is that it does not mistake a fragment starting with "aspect" in the filename, for example
    try {
      if (vaultRelativePath.startsWith(ASPECT_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, ASPECT_PREFIX);
        await syncAspect(absolutePath, entityRelativePath);
      } else if (vaultRelativePath.startsWith(FRAGMENT_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, FRAGMENT_PREFIX);
        await syncFragment(absolutePath, entityRelativePath);
      } else if (vaultRelativePath.startsWith(NOTE_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, NOTE_PREFIX);
        await syncNote(absolutePath, entityRelativePath);
      } else if (vaultRelativePath.startsWith(REFERENCE_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, REFERENCE_PREFIX);
        await syncReference(absolutePath, entityRelativePath);
      } else if (vaultRelativePath.startsWith(PIECE_PREFIX)) {
        await syncPieces(vaultRelativePath);
      }
      // .maskor/, .obsidian/, and other paths: ignored via chokidar's `ignored` config.
    } catch (error) {
      log.error(
        {
          filePath: absolutePath,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "watcher: unhandled error processing add/change event — skipping",
      );
    }
  };

  const handleUnlink = async (absolutePath: string): Promise<void> => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) return;

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);

    // TODO: Same here, lots of code duplication
    try {
      if (vaultRelativePath.startsWith(FRAGMENT_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, FRAGMENT_PREFIX);
        vaultDatabase.transaction((tx) => {
          deleteFragmentByFilePath(tx, entityRelativePath);
        });
        emit({ type: "fragment:deleted", filePath: entityRelativePath });
      } else if (vaultRelativePath.startsWith(ASPECT_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, ASPECT_PREFIX);
        const storedRow = vaultDatabase
          .select({ uuid: aspectsTable.uuid, key: aspectsTable.key })
          .from(aspectsTable)
          .where(eq(aspectsTable.filePath, entityRelativePath))
          .get();
        if (storedRow) {
          aspectRenameBuffer.add(storedRow.uuid, storedRow.key, entityRelativePath, () => {
            vaultDatabase.transaction((tx) => {
              deleteAspectByFilePath(tx, entityRelativePath);
            });
            emit({ type: "aspect:deleted", filePath: entityRelativePath });
          });
        }
      } else if (vaultRelativePath.startsWith(NOTE_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, NOTE_PREFIX);
        const storedRow = vaultDatabase
          .select({ uuid: notesTable.uuid, key: notesTable.key })
          .from(notesTable)
          .where(eq(notesTable.filePath, entityRelativePath))
          .get();
        if (storedRow) {
          noteRenameBuffer.add(storedRow.uuid, storedRow.key, entityRelativePath, () => {
            vaultDatabase.transaction((tx) => {
              deleteNoteByFilePath(tx, entityRelativePath);
            });
            emit({ type: "note:deleted", filePath: entityRelativePath });
          });
        }
      } else if (vaultRelativePath.startsWith(REFERENCE_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, REFERENCE_PREFIX);
        const storedRow = vaultDatabase
          .select({ uuid: referencesTable.uuid, key: referencesTable.key })
          .from(referencesTable)
          .where(eq(referencesTable.filePath, entityRelativePath))
          .get();
        if (storedRow) {
          referenceRenameBuffer.add(storedRow.uuid, storedRow.key, entityRelativePath, () => {
            vaultDatabase.transaction((tx) => {
              deleteReferenceByFilePath(tx, entityRelativePath);
            });
            emit({ type: "reference:deleted", filePath: entityRelativePath });
          });
        }
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
    }
  };

  return {
    start() {
      if (watcher) return; // idempotent

      // TODO: move chokidar configuration to its own file
      watcher = chokidar.watch(vaultRoot, {
        // Ignore dot files and directories (.maskor/, .obsidian/).
        ignored: /(^|[/\\])\..+/,
        persistent: true,
        // Startup sync is handled by rebuild() — ignore initial scan.
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 50,
        },
      });

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

    pause() {
      // TODO: Async race window — any handler already past the `if (isPaused) return` check and
      // mid-await when pause() is called will still complete and upsert before rebuild runs.
      // A full fix requires draining in-flight handlers before proceeding. See:
      // references/reviews/storage-sync-spec-fixes-2026-04-23.md (warning #4)
      isPaused = true;
    },

    resume() {
      isPaused = false;
    },

    subscribe(callback: (event: VaultSyncEvent) => void): () => void {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
  };
};
