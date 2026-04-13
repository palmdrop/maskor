import chokidar from "chokidar";
import path from "node:path";
import type { Logger, VaultSyncEvent } from "@maskor/shared";
import { slugify } from "@maskor/shared";
import type { VaultDatabase } from "../db/vault";
import { fragmentsTable } from "../db/vault/schema";
import type { Vault } from "../vault/types";
import { parseFile } from "../vault/markdown/parse";
import { serializeFile } from "../vault/markdown/serialize";
import * as fragmentMapper from "../vault/markdown/mappers/fragment";
import * as aspectMapper from "../vault/markdown/mappers/aspect";
import * as noteMapper from "../vault/markdown/mappers/note";
import * as referenceMapper from "../vault/markdown/mappers/reference";
import { hashContent } from "../utils/hash";
import {
  loadAspectKeyToUuid,
  upsertAspect,
  upsertFragment,
  upsertNote,
  upsertReference,
  softDeleteFragmentByFilePath,
  softDeleteAspectByFilePath,
  softDeleteNoteByFilePath,
  softDeleteReferenceByFilePath,
} from "../indexer/upserts";
import { eq } from "drizzle-orm";

export type VaultWatcher = {
  // Idempotent — calling start() when already running is a no-op.
  start(): void;
  // Safe to call before start(). Resolves immediately if never started.
  stop(): Promise<void>;
  // Pause event processing. Events that arrive while paused are dropped.
  // Use during rebuild() to avoid the watcher/rebuild race condition.
  pause(): void;
  resume(): void;
  // Subscribe to vault sync events. Returns an unsubscribe function.
  subscribe(callback: (event: VaultSyncEvent) => void): () => void;
};

// Checks whether a UUID already exists in the fragments table at a different file path.
// Returns the colliding entity-relative filePath if a collision exists, null otherwise.
const findFragmentUuidCollision = (
  vaultDatabase: VaultDatabase,
  uuid: string,
  currentEntityRelativePath: string,
): string | null => {
  const row = vaultDatabase
    .select({ filePath: fragmentsTable.filePath })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.uuid, uuid))
    .get();

  if (!row || row.filePath === currentEntityRelativePath) return null;
  return row.filePath;
};

// Converts a vault-root-relative path to entity-relative by stripping the entity prefix.
// e.g. "fragments/the-bridge.md" → "the-bridge.md"
//      "fragments/discarded/the-bridge.md" → "discarded/the-bridge.md"
const toEntityRelativePath = (vaultRelativePath: string, entityPrefix: string): string => {
  return vaultRelativePath.slice(entityPrefix.length);
};

export const createVaultWatcher = (
  vaultDatabase: VaultDatabase,
  vault: Vault,
  logger?: Logger,
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

    const isDiscarded =
      entityRelativePath.startsWith("discarded" + path.sep) ||
      entityRelativePath.startsWith("discarded/");
    const fragment = fragmentMapper.fromFile(
      parsed,
      entityRelativePath,
      isDiscarded ? "discarded" : undefined,
    );
    const aspectKeyToUuid = loadAspectKeyToUuid(vaultDatabase);

    const warnings = vaultDatabase.transaction((tx) => {
      return upsertFragment(tx, fragment, entityRelativePath, rawContent, aspectKeyToUuid);
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
      log.debug({ filePath: entityRelativePath, uuid }, "watcher: UUID written back to aspect");
    }

    // Aspects have no contentHash in DB — always upsert on change.
    const aspect = aspectMapper.fromFile(parsed);

    // TODO: Is this transaction necessarY? It's just a single upsert.
    vaultDatabase.transaction((tx) => {
      upsertAspect(tx, aspect, entityRelativePath);
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

    const note = noteMapper.fromFile(parsed, entityRelativePath);

    // TODO: Again, unnecessary transaction?
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

    const reference = referenceMapper.fromFile(parsed, entityRelativePath);

    // TODO: Again, unnecessary transaction?
    vaultDatabase.transaction((tx) => {
      upsertReference(tx, reference, entityRelativePath, rawContent);
    });

    emit({ type: "reference:synced", uuid });

    log.debug({ filePath: entityRelativePath }, "watcher: reference synced");
  };

  // Pieces/ add events: consume all current pieces in batch.
  // Trade-off: any piece add triggers consumption of ALL pieces currently in pieces/.
  // This is intentional — vault.pieces.consumeAll() is the only available consume API.
  // TODO: Add vault.pieces.consume(filePath) for single-piece consumption if needed.
  const syncPieces = async (): Promise<void> => {
    let fragments: Awaited<ReturnType<typeof vault.pieces.consumeAll>>;
    try {
      fragments = await vault.pieces.consumeAll();
    } catch (error) {
      log.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        "watcher: failed to consume pieces",
      );
      return;
    }

    if (fragments.length === 0) return;

    const aspectKeyToUuid = loadAspectKeyToUuid(vaultDatabase);

    // Pre-read all fragment files before entering the sync transaction (Bun.file is async;
    // the transaction callback is synchronous).
    type FragmentWithContent = {
      fragment: (typeof fragments)[number];
      entityRelativePath: string;
      rawContent: string;
    };
    const fragmentsWithContent: FragmentWithContent[] = [];
    for (const fragment of fragments) {
      const entityRelativePath = `${slugify(fragment.title)}.md`;
      const absoluteFragmentPath = path.join(vaultRoot, "fragments", entityRelativePath);
      try {
        const rawContent = await Bun.file(absoluteFragmentPath).text();
        fragmentsWithContent.push({ fragment, entityRelativePath, rawContent });
      } catch {
        log.warn(
          { filePath: absoluteFragmentPath },
          "watcher: could not read fragment written by consumeAll — skipping upsert",
        );
      }
    }

    vaultDatabase.transaction((tx) => {
      for (const { fragment, entityRelativePath, rawContent } of fragmentsWithContent) {
        upsertFragment(tx, fragment, entityRelativePath, rawContent, aspectKeyToUuid);
      }
    });

    emit({ type: "pieces:consumed", count: fragments.length });

    log.debug({ count: fragments.length }, "watcher: pieces consumed and indexed");
  };

  // --- event routing ---

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
        await syncPieces();
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

  const handleUnlink = (absolutePath: string): void => {
    if (isPaused) return;
    if (!absolutePath.endsWith(".md")) return;

    const vaultRelativePath = path.relative(vaultRoot, absolutePath);

    // TODO: Same here, lots of code duplication
    try {
      if (vaultRelativePath.startsWith(FRAGMENT_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, FRAGMENT_PREFIX);
        vaultDatabase.transaction((tx) => {
          softDeleteFragmentByFilePath(tx, entityRelativePath);
        });
        emit({ type: "fragment:deleted", filePath: entityRelativePath });
      } else if (vaultRelativePath.startsWith(ASPECT_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, ASPECT_PREFIX);
        vaultDatabase.transaction((tx) => {
          softDeleteAspectByFilePath(tx, entityRelativePath);
        });
        emit({ type: "aspect:deleted", filePath: entityRelativePath });
      } else if (vaultRelativePath.startsWith(NOTE_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, NOTE_PREFIX);
        vaultDatabase.transaction((tx) => {
          softDeleteNoteByFilePath(tx, entityRelativePath);
        });
        emit({ type: "note:deleted", filePath: entityRelativePath });
      } else if (vaultRelativePath.startsWith(REFERENCE_PREFIX)) {
        const entityRelativePath = toEntityRelativePath(vaultRelativePath, REFERENCE_PREFIX);
        vaultDatabase.transaction((tx) => {
          softDeleteReferenceByFilePath(tx, entityRelativePath);
        });
        emit({ type: "reference:deleted", filePath: entityRelativePath });
      }

      log.debug({ filePath: absolutePath }, "watcher: entity soft-deleted on unlink");
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
      await watcher.close();
      watcher = null;
      log.info({ vaultRoot }, "watcher: stopped");
    },

    pause() {
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
