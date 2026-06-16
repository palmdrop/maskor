import type {
  Arc,
  Aspect,
  AspectUpdate,
  AspectUpdateResponse,
  Comment,
  Fragment,
  Margin,
  Note,
  NoteUpdate,
  NoteUpdateResponse,
  ProjectUpdate,
  Reference,
  ReferenceUpdate,
  ReferenceUpdateResponse,
  Sequence,
  VaultSyncEvent,
} from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import { ArcSchema } from "@maskor/shared";
import { mkdir, rename, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { createVault } from "../vault/markdown";
import type { Vault } from "../vault/types";
import { VaultError } from "../vault/types";
import { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "../db/registry";
import { closeRawVaultDatabase, createVaultDatabase, deleteVaultDatabaseFiles } from "../db/vault";
import type { VaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import type { VaultIndexer } from "../indexer/types";
import type {
  IndexedAspect,
  IndexedFragment,
  IndexedFragmentSummary,
  IndexedNote,
  IndexedReference,
  IndexedSequence,
  RebuildStats,
} from "../indexer/types";
import { createProjectRegistry } from "../registry/registry";
import { ProjectNotFoundError } from "../registry/errors";
import type { ProjectContext, ProjectRecord } from "../registry/types";
import { createVaultWatcher } from "../watcher/watcher";
import type { VaultWatcher } from "../watcher/types";
import {
  loadKnownAspectKeys,
  upsertFragment,
  upsertAspect,
  upsertNote,
  upsertReference,
  upsertSequence,
  upsertMargin,
  relocateMarginInIndex,
  deleteMarginByFragmentUuid,
  deleteReferenceByFilePath,
  deleteFragmentByFilePath,
  deleteAspectByFilePath,
  deleteNoteByFilePath,
  deleteSequenceByFilePath,
  findAspectUuidsByNoteKey,
  findFragmentUuidsByReferenceKey,
  findFragmentUuidsByAspectKey,
} from "../indexer/upserts";
import { markerIdSet, extractBlockOpening } from "@maskor/shared";
import {
  rewriteDocumentLinks,
  entityKindToLinkPathType,
  type LinkEntityKind,
} from "@maskor/shared";
import { findLinkSourceUuids } from "../indexer/links";
import type { Transaction } from "../indexer/upserts";
import { hashContent } from "../utils/hash";
import { joinCategoryPath } from "../utils/category";
import { ensureVaultSkeleton } from "../utils/vault-skeleton";
import { parseFile } from "../vault/markdown/parse";
import { applyInlineLinkMetadata } from "../vault/markdown/inline-link-metadata";
import * as fragmentMapper from "../vault/markdown/mappers/fragment";
import { CooldownSet } from "../suggestion/cooldown";
import { selectNextSuggestion } from "../suggestion/selector";
import {
  getStats,
  getStatsBatch,
  getStatsForProject,
  setWordCount,
  incrementVoluntaryOpen,
  incrementPromptAccept,
  incrementEdit,
  incrementAvoidance,
} from "../suggestion/stats-repo";
import type { FragmentStats, ProjectStats } from "../suggestion/stats-repo";
import { computeWordCount } from "../suggestion/word-count";
import { createActionLogWriter, readRecentEntries } from "../action-log";
import type { ActionLogWriter } from "../action-log";
import { getCurrentFragmentUUID, setCurrentFragmentUUID } from "../suggestion/project-state-repo";
import { listWarnings, dismissWarning } from "../warnings/warnings-repo";
import type { StoredWarning, DismissResult } from "../warnings/warnings-repo";
import { createSwapStorage } from "../swap";
import type { SwapEntityType, SwapFile, SwapListEntry, SwapStorage } from "../swap";
import type { DraftManifest, LogEntry } from "@maskor/shared";
import {
  cleanupStaleDirectories,
  createDraft,
  deleteDraft,
  listDrafts,
  restoreDraft,
  withDraftMutex,
  type ListedDraft,
} from "../drafts";
import { withVaultWriteLock } from "../utils/vault-write-lock";

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
  const suggestionCooldownCache = new Map<string, CooldownSet>();
  const actionLogWriterCache = new Map<string, Promise<ActionLogWriter>>();
  const swapStorageCache = new Map<string, SwapStorage>();

  // Subscriber bus lives on the service (not the watcher) so SSE clients
  // survive a watcher teardown — e.g. during a draft restore.
  const eventSubscribers = new Map<string, Set<(event: VaultSyncEvent) => void>>();

  const emitVaultEvent = (projectUUID: string, event: VaultSyncEvent): void => {
    const callbacks = eventSubscribers.get(projectUUID);
    if (!callbacks) return;
    for (const callback of callbacks) {
      callback(event);
    }
  };

  // --- private helpers ---

  const getActionLogWriter = (context: ProjectContext): Promise<ActionLogWriter> => {
    const cached = actionLogWriterCache.get(context.projectUUID);
    if (cached) return cached;
    const writerPromise = createActionLogWriter({ vaultPath: context.vaultPath, logger });
    actionLogWriterCache.set(context.projectUUID, writerPromise);
    return writerPromise;
  };

  const getSwapStorage = (context: ProjectContext): SwapStorage => {
    const cached = swapStorageCache.get(context.projectUUID);
    if (cached) return cached;
    const storage = createSwapStorage({ vaultPath: context.vaultPath, logger });
    swapStorageCache.set(context.projectUUID, storage);
    return storage;
  };

  const getVault = (context: ProjectContext): Vault => {
    const cached = vaultCache.get(context.projectUUID);
    if (cached) return cached;

    const vault = createVault({
      root: context.vaultPath,
      projectUuid: context.projectUUID,
      logger,
    });
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

  // The authoritative fragment body for a uuid, or null when the fragment is unknown / its file is
  // missing. The marker ids and the comment excerpts the Margin index derives both come from here.
  const readFragmentContent = async (
    context: ProjectContext,
    fragmentUuid: string,
  ): Promise<string | null> => {
    const filePath = await getVaultIndexer(context).fragments.findFilePath(fragmentUuid);
    if (!filePath) return null;
    try {
      const fragment = await getVault(context).fragments.read(filePath);
      return fragment.content;
    } catch (error) {
      if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") return null;
      throw error;
    }
  };

  // Read the current Margin for a fragment, or null when none exists. Reads the authoritative vault
  // file (full notes + comment bodies), located via the index.
  const readMargin = async (
    context: ProjectContext,
    fragmentUuid: string,
  ): Promise<Margin | null> => {
    const filePath = await getVaultIndexer(context).margins.findFilePath(fragmentUuid);
    if (!filePath) return null;
    try {
      return await getVault(context).margins.read(filePath);
    } catch (error) {
      if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") return null;
      throw error;
    }
  };

  // Persist a Margin's notes + comments to the vault file (lazy-creating it) and inline-upsert the
  // DB row + per-comment orphan flags so the index is coherent before the watcher fires. Caller
  // must hold the vault write lock. Preserves `createdAt` across rewrites.
  const persistMargin = async (
    context: ProjectContext,
    fragmentUuid: string,
    notes: string,
    comments: Comment[],
  ): Promise<Margin> => {
    const indexedFragment = await getVaultIndexer(context).fragments.findByUUID(fragmentUuid);
    if (!indexedFragment) {
      throw new VaultError(
        "FRAGMENT_NOT_FOUND",
        `Cannot write Margin: fragment "${fragmentUuid}" not found in index`,
        { uuid: fragmentUuid, reason: "UUID not present in vault index" },
      );
    }

    const existing = await readMargin(context, fragmentUuid);

    // The backend is the single authority for each comment's stored excerpt (review #1): an *anchored*
    // comment's excerpt is always (re)derived from its block's current opening in the fragment body, so
    // a client write can never persist a stale excerpt over the live block. An *orphaned* comment
    // (marker absent) keeps its provided last-known excerpt, frozen.
    const fragmentContent = await readFragmentContent(context, fragmentUuid);
    const fragmentMarkerIds = fragmentContent ? markerIdSet(fragmentContent) : new Set<string>();
    const resolvedComments = comments.map((comment) => {
      if (!fragmentContent || !fragmentMarkerIds.has(comment.markerId)) return comment;
      const opening = extractBlockOpening(fragmentContent, comment.markerId);
      return opening === null ? comment : { ...comment, excerpt: opening };
    });

    const margin: Margin = {
      fragmentUuid,
      fragmentKey: indexedFragment.key,
      notes,
      comments: resolvedComments,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    await getVault(context).margins.write(margin);

    const entityRelativePath = `${indexedFragment.key}.md`;
    const absolutePath = join(context.vaultPath, "margins", entityRelativePath);
    const rawContent = await Bun.file(absolutePath).text();

    getVaultDatabase(context).transaction((tx) => {
      upsertMargin(tx, margin, entityRelativePath, rawContent);
    });

    return margin;
  };

  // On a fragment content edit, keep the bound Margin's stored excerpts honest: refresh each
  // *anchored* comment's excerpt from its block's current opening, and *freeze* the excerpt once the
  // comment is orphaned (its marker is gone). Returns true when an excerpt changed (and the Margin
  // file was rewritten) so the caller can emit `margin:synced`. Caller holds the vault write lock.
  // Orphan state is not persisted — the panel derives it live — so a pure orphan flip (a marker
  // appearing/disappearing without any anchored excerpt moving) leaves the index identical and emits
  // nothing, which is correct: there is nothing for a client to refetch.
  const refreshMarginExcerptsOnFragmentSave = async (
    context: ProjectContext,
    fragmentUuid: string,
    fragmentContent: string,
  ): Promise<boolean> => {
    const fragmentMarkerIds = markerIdSet(fragmentContent);
    const margin = await readMargin(context, fragmentUuid);
    if (!margin) return false;

    let changed = false;
    const refreshedComments: Comment[] = margin.comments.map((comment) => {
      const anchored = fragmentMarkerIds.has(comment.markerId);
      // Orphaned comments freeze their last-known excerpt — never recompute from a now-absent block.
      if (!anchored) return comment;
      const opening = extractBlockOpening(fragmentContent, comment.markerId) ?? comment.excerpt;
      if (opening !== comment.excerpt) changed = true;
      return { ...comment, excerpt: opening };
    });

    if (changed) {
      // Rewrite the file (and reindex) so the Obsidian-visible `> excerpt` matches the live block.
      await persistMargin(context, fragmentUuid, margin.notes, refreshedComments);
    }

    return changed;
  };

  const getSuggestionCooldown = (context: ProjectContext): CooldownSet => {
    const cached = suggestionCooldownCache.get(context.projectUUID);
    if (cached) return cached;
    const cooldown = new CooldownSet();
    suggestionCooldownCache.set(context.projectUUID, cooldown);
    return cooldown;
  };

  const getVaultWatcher = (context: ProjectContext): VaultWatcher => {
    const cached = vaultWatcherCache.get(context.projectUUID);
    if (cached) return cached;

    const vault = getVault(context);
    const vaultDatabase = getVaultDatabase(context);
    const watcher = createVaultWatcher(
      vaultDatabase,
      vault,
      (event) => emitVaultEvent(context.projectUUID, event),
      logger,
      {
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
        onFragmentRename: async (oldKey, newKey, renamedUuid) => {
          const payload = await cascadeFragmentKeyRename(context, oldKey, newKey, renamedUuid);
          vaultDatabase.transaction((tx) => payload.commit(tx));
        },
      },
    );
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

  // After a category move the old file's parent directories may be left empty
  // (e.g. moving the last aspect out of aspects/theme/). Walk up to but not
  // including entityRoot, removing every empty directory we encounter. rmdir
  // fails with ENOTEMPTY for non-empty dirs; treat that and ENOENT as the stop
  // condition. Any other error is logged and swallowed — cleanup is best-effort.
  const pruneEmptyParents = async (entityRoot: string, fromAbsolutePath: string): Promise<void> => {
    let directory = dirname(fromAbsolutePath);
    while (directory.startsWith(entityRoot + "/") && directory !== entityRoot) {
      try {
        await rmdir(directory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOTEMPTY" || code === "ENOENT" || code === "EEXIST") return;
        log.warn(
          { directory, errorCode: code },
          "category move cleanup: failed to remove empty parent directory",
        );
        return;
      }
      directory = dirname(directory);
    }
  };

  // A rename writes the new-key (or new-category) file, then removes the old one.
  // On case-insensitive filesystems (macOS APFS, Windows NTFS) a case-only rename
  // (e.g. "MyNote" → "mynote") maps both names to the same physical file, so the
  // naive write-then-unlink would delete the content we just wrote. Detect that
  // case and hop the old file through a temp path first, so the file always
  // survives. Returns once the new file is in place and the old one is gone.
  const writeFileWithCaseSafeRename = async (params: {
    entityRoot: string; // absolute entity-type directory, e.g. <vault>/notes
    oldRelativePath: string | null | undefined; // relative to entityRoot
    newRelativePath: string; // relative to entityRoot
    tempSeed: string; // unique seed for the temp filename (entity UUID)
    writeFile: () => Promise<void>; // writes the new-key file to disk
    pruneParentsOnMove?: boolean; // prune now-empty category folders after a real move
  }): Promise<void> => {
    const { entityRoot, oldRelativePath, newRelativePath, tempSeed, writeFile } = params;

    const hasKeyChange =
      oldRelativePath !== null &&
      oldRelativePath !== undefined &&
      oldRelativePath !== newRelativePath;
    const isCaseOnlyRename =
      hasKeyChange && oldRelativePath!.toLowerCase() === newRelativePath.toLowerCase();

    if (isCaseOnlyRename) {
      const oldAbsolutePath = join(entityRoot, oldRelativePath!);
      const tempAbsolutePath = join(entityRoot, dirname(oldRelativePath!), `${tempSeed}---tmp.md`);
      await rename(oldAbsolutePath, tempAbsolutePath);
      await writeFile();
      await unlink(tempAbsolutePath).catch(() => {});
      return;
    }

    await writeFile();

    if (hasKeyChange) {
      const oldAbsolutePath = join(entityRoot, oldRelativePath!);
      await unlink(oldAbsolutePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          log.warn({ filePath: oldRelativePath }, "rename cleanup: old entity file already gone");
          return;
        }
        throw error;
      });
      if (params.pruneParentsOnMove) {
        await pruneEmptyParents(entityRoot, oldAbsolutePath);
      }
    }
  };

  // Rejects a write whose key collides (case-insensitively) with a different
  // keyed entity of the same type. Keys are unique per entity type globally
  // (across all category subfolders), so the candidate is checked against the
  // full set. The entity's own row is excluded by UUID, so a no-op save or a
  // case-only rename of the same entity passes. `subjectPhrase` is the
  // article-prefixed noun used in the error message ("An aspect", "A note",
  // "A reference").
  const assertKeyedEntityKeyAvailable = (
    existing: readonly { uuid: string; key: string }[],
    candidate: { uuid: string; key: string },
    subjectPhrase: string,
  ): void => {
    const lowerKey = candidate.key.toLowerCase();
    if (
      existing.some(
        (other) => other.uuid !== candidate.uuid && other.key.toLowerCase() === lowerKey,
      )
    ) {
      throw new VaultError(
        "KEY_CONFLICT",
        `${subjectPhrase} with key "${candidate.key}" already exists`,
        { reason: "key_conflict" },
      );
    }
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
      const newFilePath = joinCategoryPath(updated.category, updated.key);
      const rawContent = await Bun.file(join(context.vaultPath, "aspects", newFilePath)).text();
      cascaded.push({ aspect: updated, filePath: newFilePath, rawContent });
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

  // Body-rewrite cascade for notes — read each affected note, transform its content, write it back,
  // and stage the re-index. Mirrors cascadeFragments/cascadeAspects (key/category unchanged here, so
  // the file path is stable).
  const cascadeNotes = async (
    context: ProjectContext,
    affectedUuids: string[],
    updateFn: (note: Note) => Note,
  ): Promise<{ touched: string[]; commit: (tx: Transaction) => void }> => {
    const vault = getVault(context);
    const indexer = getVaultIndexer(context);
    type Cascaded = { note: Note; filePath: string; rawContent: string };
    const touched: string[] = [];
    const cascaded: Cascaded[] = [];
    for (const uuid of affectedUuids) {
      const indexed = await indexer.notes.findByUUID(uuid);
      if (!indexed) {
        touched.push(uuid);
        continue;
      }
      const updated = updateFn(await vault.notes.read(indexed.filePath));
      await vault.notes.write(updated);
      const filePath = joinCategoryPath(updated.category, updated.key);
      const rawContent = await Bun.file(join(context.vaultPath, "notes", filePath)).text();
      cascaded.push({ note: updated, filePath, rawContent });
      touched.push(uuid);
    }
    return {
      touched,
      commit: (tx) => {
        for (const { note, filePath, rawContent } of cascaded)
          upsertNote(tx, note, filePath, rawContent);
      },
    };
  };

  // Body-rewrite cascade for references — same shape as cascadeNotes.
  const cascadeReferences = async (
    context: ProjectContext,
    affectedUuids: string[],
    updateFn: (reference: Reference) => Reference,
  ): Promise<{ touched: string[]; commit: (tx: Transaction) => void }> => {
    const vault = getVault(context);
    const indexer = getVaultIndexer(context);
    type Cascaded = { reference: Reference; filePath: string; rawContent: string };
    const touched: string[] = [];
    const cascaded: Cascaded[] = [];
    for (const uuid of affectedUuids) {
      const indexed = await indexer.references.findByUUID(uuid);
      if (!indexed) {
        touched.push(uuid);
        continue;
      }
      const updated = updateFn(await vault.references.read(indexed.filePath));
      await vault.references.write(updated);
      const filePath = joinCategoryPath(updated.category, updated.key);
      const rawContent = await Bun.file(join(context.vaultPath, "references", filePath)).text();
      cascaded.push({ reference: updated, filePath, rawContent });
      touched.push(uuid);
    }
    return {
      touched,
      commit: (tx) => {
        for (const { reference, filePath, rawContent } of cascaded)
          upsertReference(tx, reference, filePath, rawContent);
      },
    };
  };

  // Union of two UUID lists, order-preserving and deduped.
  const unionUuids = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];

  // Rewrite inline `[[kind/oldKey]]` links to `newKey` in every note and reference body that links to
  // the renamed entity. (Fragments are handled by the caller's combined fragment pass so a fragment is
  // never written twice.) `excludeUuid` skips the renamed entity itself (its own file is written by the
  // primary update). Returns the touched uuids + a batched commit.
  const cascadeLinkBodiesNotesReferences = async (
    context: ProjectContext,
    kind: LinkEntityKind,
    oldKey: string,
    newKey: string,
    excludeUuid: string | undefined,
  ): Promise<{ notes: string[]; references: string[]; commit: (tx: Transaction) => void }> => {
    const pathType = entityKindToLinkPathType(kind);
    const vaultDatabase = getVaultDatabase(context);
    const rewrite = (content: string) => rewriteDocumentLinks(content, pathType, oldKey, newKey);

    const notePayload = await cascadeNotes(
      context,
      findLinkSourceUuids(vaultDatabase, kind, oldKey, "note").filter(
        (uuid) => uuid !== excludeUuid,
      ),
      (note) => ({ ...note, content: rewrite(note.content) }),
    );
    const referencePayload = await cascadeReferences(
      context,
      findLinkSourceUuids(vaultDatabase, kind, oldKey, "reference").filter(
        (uuid) => uuid !== excludeUuid,
      ),
      (reference) => ({ ...reference, content: rewrite(reference.content) }),
    );

    return {
      notes: notePayload.touched,
      references: referencePayload.touched,
      commit: (tx) => {
        notePayload.commit(tx);
        referencePayload.commit(tx);
      },
    };
  };

  const cascadeNoteKeyRename = async (
    context: ProjectContext,
    oldKey: string,
    newKey: string,
    renamedUuid?: string,
  ): Promise<{ fragments: string[]; aspects: string[]; commit: (tx: Transaction) => void }> => {
    const vaultDatabase = getVaultDatabase(context);
    const pathType = entityKindToLinkPathType("note");
    // Fragments no longer carry a notes attachment (margins replaced it — ADR 0007), so a note rename
    // cascades to aspects' notes list (metadata) and to inline `[[notes/oldKey]]` links in every body.
    const aspectPayload = await cascadeAspects(
      context,
      findAspectUuidsByNoteKey(vaultDatabase, oldKey),
      (aspect) => ({
        ...aspect,
        notes: aspect.notes.map((note) => (note === oldKey ? newKey : note)),
      }),
    );
    const fragmentLinkPayload = await cascadeFragments(
      context,
      findLinkSourceUuids(vaultDatabase, "note", oldKey, "fragment"),
      (fragment) => ({
        ...fragment,
        content: rewriteDocumentLinks(fragment.content, pathType, oldKey, newKey),
      }),
    );
    const bodyPayload = await cascadeLinkBodiesNotesReferences(
      context,
      "note",
      oldKey,
      newKey,
      renamedUuid,
    );
    return {
      fragments: fragmentLinkPayload.touched,
      aspects: aspectPayload.touched,
      commit: (tx) => {
        aspectPayload.commit(tx);
        fragmentLinkPayload.commit(tx);
        bodyPayload.commit(tx);
      },
    };
  };

  const cascadeReferenceKeyRename = async (
    context: ProjectContext,
    oldKey: string,
    newKey: string,
    renamedUuid?: string,
  ): Promise<{ fragments: string[]; commit: (tx: Transaction) => void }> => {
    const vaultDatabase = getVaultDatabase(context);
    const pathType = entityKindToLinkPathType("reference");
    // Fragments are affected both via their reference list (metadata) and inline `[[references/oldKey]]`
    // links — combine into one fragment pass over the union so a fragment is never written twice.
    const fragmentUuids = unionUuids(
      findFragmentUuidsByReferenceKey(vaultDatabase, oldKey),
      findLinkSourceUuids(vaultDatabase, "reference", oldKey, "fragment"),
    );
    const fragmentPayload = await cascadeFragments(context, fragmentUuids, (fragment) => ({
      ...fragment,
      references: fragment.references.map((reference) =>
        reference === oldKey ? newKey : reference,
      ),
      content: rewriteDocumentLinks(fragment.content, pathType, oldKey, newKey),
    }));
    const bodyPayload = await cascadeLinkBodiesNotesReferences(
      context,
      "reference",
      oldKey,
      newKey,
      renamedUuid,
    );
    return {
      fragments: fragmentPayload.touched,
      commit: (tx) => {
        fragmentPayload.commit(tx);
        bodyPayload.commit(tx);
      },
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
    const pathType = entityKindToLinkPathType("aspect");
    // Fragments are affected both via their aspect map (metadata) and inline `[[aspects/oldKey]]` links
    // — combine into one fragment pass over the union.
    const fragmentUuids = unionUuids(
      findFragmentUuidsByAspectKey(vaultDatabase, oldKey),
      findLinkSourceUuids(vaultDatabase, "aspect", oldKey, "fragment"),
    );
    const fragmentPayload = await cascadeFragments(context, fragmentUuids, (fragment) => {
      const oldAspect = fragment.aspects[oldKey];
      const updatedAspects = { ...fragment.aspects };
      delete updatedAspects[oldKey];
      if (oldAspect !== undefined) {
        updatedAspects[newKey] = oldAspect;
      }
      return {
        ...fragment,
        aspects: updatedAspects,
        content: rewriteDocumentLinks(fragment.content, pathType, oldKey, newKey),
      };
    });
    // Aspects are not link sources, so only note + reference bodies need link rewriting.
    const bodyPayload = await cascadeLinkBodiesNotesReferences(
      context,
      "aspect",
      oldKey,
      newKey,
      undefined,
    );
    return {
      fragments: fragmentPayload.touched,
      commit: (tx) => {
        fragmentPayload.commit(tx);
        bodyPayload.commit(tx);
      },
    };
  };

  // Fragment rename cascade (net-new — fragment renames previously did not cascade). Fragments are not
  // attached anywhere via metadata, so this is purely an inline `[[fragments/oldKey]]` link rewrite
  // across every fragment / note / reference body, excluding the renamed fragment itself.
  const cascadeFragmentKeyRename = async (
    context: ProjectContext,
    oldKey: string,
    newKey: string,
    renamedUuid: string,
  ): Promise<{ commit: (tx: Transaction) => void }> => {
    const vaultDatabase = getVaultDatabase(context);
    const pathType = entityKindToLinkPathType("fragment");
    const fragmentPayload = await cascadeFragments(
      context,
      findLinkSourceUuids(vaultDatabase, "fragment", oldKey, "fragment").filter(
        (uuid) => uuid !== renamedUuid,
      ),
      (fragment) => ({
        ...fragment,
        content: rewriteDocumentLinks(fragment.content, pathType, oldKey, newKey),
      }),
    );
    const bodyPayload = await cascadeLinkBodiesNotesReferences(
      context,
      "fragment",
      oldKey,
      newKey,
      renamedUuid,
    );
    return {
      commit: (tx) => {
        fragmentPayload.commit(tx);
        bodyPayload.commit(tx);
      },
    };
  };

  const cascadeAspectDelete = async (
    context: ProjectContext,
    aspectKey: string,
  ): Promise<{ fragments: string[]; commit: (tx: Transaction) => void }> => {
    await deleteArc(context, aspectKey);
    const vaultDatabase = getVaultDatabase(context);
    const fragmentPayload = await cascadeFragments(
      context,
      findFragmentUuidsByAspectKey(vaultDatabase, aspectKey),
      (fragment) => {
        const updatedAspects = { ...fragment.aspects };
        delete updatedAspects[aspectKey];
        return { ...fragment, aspects: updatedAspects };
      },
    );
    return {
      fragments: fragmentPayload.touched,
      commit: fragmentPayload.commit,
    };
  };

  // Strip a deleted reference key from every fragment's reference list. Inline `[[references/key]]`
  // links in bodies are deliberately left intact (they become broken links — bodies are never
  // auto-rewritten on delete; document-links.md).
  const cascadeReferenceDelete = async (
    context: ProjectContext,
    referenceKey: string,
  ): Promise<{ fragments: string[]; commit: (tx: Transaction) => void }> => {
    const vaultDatabase = getVaultDatabase(context);
    const fragmentPayload = await cascadeFragments(
      context,
      findFragmentUuidsByReferenceKey(vaultDatabase, referenceKey),
      (fragment) => ({
        ...fragment,
        references: fragment.references.filter((reference) => reference !== referenceKey),
      }),
    );
    return { fragments: fragmentPayload.touched, commit: fragmentPayload.commit };
  };

  // --- public API ---

  return {
    // Registry operations (no context required)

    async registerProject(
      name: string,
      vaultPath: string,
      mode: "adopt" | "create",
    ): Promise<ProjectRecord> {
      const record = await registry.registerProject(name, vaultPath, mode);
      log.info({ projectUUID: record.projectUUID, name, vaultPath, mode }, "project registered");
      return record;
    },

    async listProjects(): Promise<ProjectRecord[]> {
      return registry.listProjects();
    },

    // Stop every cached watcher and forget it. Each stop() drains its
    // rename-buffer timers and closes the chokidar instance, so no deferred
    // event can fire a DB write after the caller tears the vault down. Used by
    // tests in teardown (before deleting the temp vault dir) and available for
    // a graceful app shutdown. See the OS note in watcher/sync/keyed-entity.ts
    // for why an un-stopped watcher poisons a Linux test run.
    async shutdown(): Promise<void> {
      for (const watcher of vaultWatcherCache.values()) {
        await watcher.stop();
      }
      vaultWatcherCache.clear();
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
      suggestionCooldownCache.delete(projectUUID);
      log.info({ projectUUID }, "project removed");
    },

    async updateProject(projectUUID: string, patch: ProjectUpdate): Promise<ProjectRecord> {
      const record = await registry.updateProject(projectUUID, patch);
      log.info({ projectUUID, patch }, "project updated");
      return record;
    },

    async updateProjectVaultPath(
      projectUUID: string,
      newPath: string,
      forceOverride?: boolean,
    ): Promise<ProjectRecord> {
      const record = await registry.updateVaultPath(projectUUID, newPath, forceOverride);
      log.info({ projectUUID, newPath, forceOverride }, "project vault path updated");
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
      // Spec § Crash recovery: clean any stale .staging/.restore-aside left
      // behind by an interrupted draft create or restore before the user
      // touches the project.
      await cleanupStaleDirectories(vaultPath, logger);
      // Lazy repair: ensure skeleton dirs exist for vaults predating full skeleton bootstrap.
      await ensureVaultSkeleton(vaultPath);
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

      async readAllSummaries(context: ProjectContext): Promise<IndexedFragmentSummary[]> {
        return getVaultIndexer(context).fragments.findAllSummaries();
      },

      async write(
        context: ProjectContext,
        fragment: Fragment,
        options?: { contentChanged?: boolean },
      ): Promise<Fragment> {
        return withVaultWriteLock(context.vaultPath, async () => {
          // Auto-sync inline `[[references/…]]` / `[[aspects/…]]` links into metadata before persisting
          // (document-links.md). Aspect reaping only follows a body change so a metadata-only save never
          // drops a weight-0 aspect the user just set via the form.
          const fragmentToWrite = {
            ...applyInlineLinkMetadata(fragment, options?.contentChanged ?? false),
            updatedAt: new Date(),
          };

          // Capture old path before writing the new file — needed for orphan cleanup on rename.
          const indexer = getVaultIndexer(context);
          const oldFilePath = await indexer.fragments.findFilePath(fragment.uuid);

          // Active and discarded fragments share a key namespace by directory; only conflict
          // within the same namespace. Without this guard, vault.write would silently overwrite
          // a sibling file and the inline upsert would fail on the unique file_path constraint
          // — leaving both fragments unrecoverable.
          const allFragments = await indexer.fragments.findAll(); // TODO: isn't this very expensive for large projects???
          const lowerKey = fragmentToWrite.key.toLowerCase();
          if (
            allFragments.some(
              (other) =>
                other.uuid !== fragmentToWrite.uuid &&
                other.isDiscarded === fragmentToWrite.isDiscarded &&
                other.key.toLowerCase() === lowerKey,
            )
          ) {
            throw new VaultError(
              "KEY_CONFLICT",
              `A fragment with key "${fragmentToWrite.key}" already exists`,
              { reason: "key_conflict" },
            );
          }

          // Inline DB update — closes the stale-index window for API-originated writes.
          // The watcher will fire afterward and hash-guard to a no-op.
          const entityRelativePath = fragmentToWrite.isDiscarded
            ? join("discarded", `${fragmentToWrite.key}.md`)
            : `${fragmentToWrite.key}.md`;

          await writeFileWithCaseSafeRename({
            entityRoot: join(context.vaultPath, "fragments"),
            oldRelativePath: oldFilePath,
            newRelativePath: entityRelativePath,
            tempSeed: fragmentToWrite.uuid,
            writeFile: () => getVault(context).fragments.write(fragmentToWrite),
          });

          // Cascade a key rename to the fragment's Margin (margins/<key>.md follows the fragment
          // key) and to inline `[[fragments/oldKey]]` links in every referring body. No-op when the
          // key is unchanged or the fragment has no Margin / referrers.
          let marginRenamed = false;
          let renameCascade: { commit: (tx: Transaction) => void } | null = null;
          if (oldFilePath) {
            const oldKey = basename(oldFilePath).replace(/\.md$/, "");
            if (oldKey !== fragmentToWrite.key) {
              await getVault(context).margins.rename(oldKey, fragmentToWrite.key);
              marginRenamed = true;
              renameCascade = await cascadeFragmentKeyRename(
                context,
                oldKey,
                fragmentToWrite.key,
                fragmentToWrite.uuid,
              );
            }
          }

          const absolutePath = join(context.vaultPath, "fragments", entityRelativePath);
          const rawContent = await Bun.file(absolutePath).text();
          const contentHash = hashContent(rawContent);
          const vaultDatabase = getVaultDatabase(context);
          const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

          vaultDatabase.transaction((tx) => {
            upsertFragment(tx, fragmentToWrite, entityRelativePath, rawContent, knownAspectKeys);
            // Rewrite + re-index referring bodies after the renamed fragment's own row is updated, so
            // their links resolve to the new key.
            renameCascade?.commit(tx);
            // Keep the Margin index in step with the renamed file inline (the watcher would
            // otherwise lag); the margins/<key>.md path mirrors the fragment's relative path.
            if (marginRenamed) {
              relocateMarginInIndex(
                tx,
                fragmentToWrite.uuid,
                fragmentToWrite.key,
                entityRelativePath,
              );
            }
          });

          setWordCount(
            vaultDatabase,
            fragmentToWrite.uuid,
            computeWordCount(fragmentToWrite.content),
          );

          // The fragment body carries the anchor markers, so a content edit may orphan/rebind a
          // comment in the bound Margin and shifts the block openings its excerpts mirror. Refresh
          // each anchored comment's excerpt from its current block (freezing orphaned ones) and
          // recompute orphan flags; when anything changed, emit margin:synced — the watcher can't
          // (its hash-guard sees the inline-written fragment row and short-circuits before it would
          // emit).
          if (
            await refreshMarginExcerptsOnFragmentSave(
              context,
              fragmentToWrite.uuid,
              fragmentToWrite.content,
            )
          ) {
            emitVaultEvent(context.projectUUID, {
              type: "margin:synced",
              fragmentUuid: fragmentToWrite.uuid,
            });
          }

          return { ...fragmentToWrite, contentHash };
        });
      },

      async discard(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
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
          const destinationEntityRelativePath = join("discarded", `${indexed.key}.md`);

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
            // Move the Margin index row in step with the fragment (key unchanged, path moves into
            // discarded/); the watcher would otherwise briefly drop and re-add the row.
            relocateMarginInIndex(tx, uuid, indexed.key, destinationEntityRelativePath);
          });

          // The Margin follows the fragment into discarded/.
          await getVault(context).margins.discard(indexed.key);
        });
      },

      async restore(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
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

          const allFragments = await indexer.fragments.findAll();
          const lowerKey = indexed.key.toLowerCase();
          if (
            allFragments.some(
              (other) =>
                other.uuid !== uuid && !other.isDiscarded && other.key.toLowerCase() === lowerKey,
            )
          ) {
            throw new VaultError(
              "KEY_CONFLICT",
              `Cannot restore: an active fragment with key "${indexed.key}" already exists`,
              { reason: "key_conflict" },
            );
          }

          const sourceEntityRelativePath = indexed.filePath;
          const destinationEntityRelativePath = `${indexed.key}.md`;

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
            // Move the Margin index row back out of discarded/ in step with the fragment.
            relocateMarginInIndex(tx, uuid, indexed.key, destinationEntityRelativePath);
          });

          // The Margin follows the fragment back out of discarded/.
          await getVault(context).margins.restore(indexed.key);
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const indexer = getVaultIndexer(context);
          const indexed = await indexer.fragments.findByUUID(uuid);

          if (!indexed) {
            throw new VaultError(
              "FRAGMENT_NOT_FOUND",
              `Cannot delete: fragment "${uuid}" not found in index`,
              { uuid, reason: "UUID not present in vault index" },
            );
          }

          if (!indexed.isDiscarded) {
            throw new VaultError(
              "FRAGMENT_NOT_DISCARDED",
              `Cannot delete: fragment "${uuid}" must be discarded before permanent deletion`,
              { uuid },
            );
          }

          try {
            await getVault(context).fragments.delete(indexed.filePath);
          } catch (error) {
            if (error instanceof VaultError && error.code === "FILE_NOT_FOUND") {
              log.warn(
                { uuid, filePath: indexed.filePath },
                "stale index: fragment file missing on delete",
              );
              throw new VaultError(
                "STALE_INDEX",
                `Cannot delete: fragment "${uuid}" file missing — index may be stale`,
                { uuid, filePath: indexed.filePath },
              );
            }
            throw error;
          }

          const vaultDatabase = getVaultDatabase(context);
          vaultDatabase.transaction((tx) => {
            deleteFragmentByFilePath(tx, indexed.filePath);
            // Drop the Margin index row in step with the fragment (the file is removed below).
            deleteMarginByFragmentUuid(tx, uuid);
          });

          // The Margin is deleted alongside its fragment.
          await getVault(context).margins.delete(indexed.key);
        });
      },
    },

    // Margin operations — a fragment's companion annotation document.

    margins: {
      // Read a fragment's Margin, or null when none exists yet (lazily created on first write).
      async read(context: ProjectContext, fragmentUuid: string): Promise<Margin | null> {
        return readMargin(context, fragmentUuid);
      },

      // Replace a fragment's Margin (notes + comments). Lazily creates the file on first write.
      async write(
        context: ProjectContext,
        fragmentUuid: string,
        input: { notes: string; comments: Comment[] },
      ): Promise<Margin> {
        return withVaultWriteLock(context.vaultPath, () =>
          persistMargin(context, fragmentUuid, input.notes, input.comments),
        );
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
        return withVaultWriteLock(context.vaultPath, async () => {
          const allAspects = await getVaultIndexer(context).aspects.findAll();
          assertKeyedEntityKeyAvailable(allAspects, aspect, "An aspect");

          await getVault(context).aspects.write(aspect);

          // Inline DB update — closes the stale-index window for API-originated writes.
          const entityRelativePath = joinCategoryPath(aspect.category, aspect.key);
          const absolutePath = join(context.vaultPath, "aspects", entityRelativePath);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          vaultDatabase.transaction((tx) => {
            upsertAspect(tx, aspect, entityRelativePath, rawContent);
          });
        });
      },

      async delete(
        context: ProjectContext,
        uuid: string,
      ): Promise<{ cascadedFragments: string[] }> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const indexer = getVaultIndexer(context);
          const indexed = await indexer.aspects.findByUUID(uuid);

          if (!indexed) {
            throw new VaultError(
              "ENTITY_NOT_FOUND",
              `Cannot delete: aspect "${uuid}" not found in index`,
              { uuid, reason: "UUID not present in vault index" },
            );
          }

          const aspectKey = indexed.key;
          const cascadePayload = await cascadeAspectDelete(context, aspectKey);

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
            cascadePayload.commit(tx);
          });

          return { cascadedFragments: cascadePayload.fragments };
        });
      },

      async update(
        context: ProjectContext,
        uuid: string,
        patch: AspectUpdate,
      ): Promise<AspectUpdateResponse> {
        return withVaultWriteLock(context.vaultPath, async () => {
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
              ...(patch.category !== undefined && { category: patch.category ?? undefined }),
              ...(patch.color !== undefined && { color: patch.color ?? undefined }),
              ...(patch.description !== undefined && { description: patch.description }),
              ...(patch.notes !== undefined && { notes: patch.notes }),
            };

            if (patch.key !== undefined && patch.key !== oldKey) {
              assertKeyedEntityKeyAvailable(await indexer.aspects.findAll(), updated, "An aspect");
            }

            const newFilePath = joinCategoryPath(updated.category, updated.key);

            await writeFileWithCaseSafeRename({
              entityRoot: join(context.vaultPath, "aspects"),
              oldRelativePath: indexed.filePath,
              newRelativePath: newFilePath,
              tempSeed: uuid,
              writeFile: () => getVault(context).aspects.write(updated),
              pruneParentsOnMove: true,
            });

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
        return withVaultWriteLock(context.vaultPath, async () => {
          const allNotes = await getVaultIndexer(context).notes.findAll();
          assertKeyedEntityKeyAvailable(allNotes, note, "A note");

          await getVault(context).notes.write(note);

          // Inline DB update — closes the stale-index window for API-originated writes.
          const entityRelativePath = joinCategoryPath(note.category, note.key);
          const absolutePath = join(context.vaultPath, "notes", entityRelativePath);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          vaultDatabase.transaction((tx) => {
            upsertNote(tx, note, entityRelativePath, rawContent);
          });
        });
      },

      async update(
        context: ProjectContext,
        uuid: string,
        patch: NoteUpdate,
      ): Promise<NoteUpdateResponse> {
        return withVaultWriteLock(context.vaultPath, async () => {
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
              ...(patch.category !== undefined && { category: patch.category ?? undefined }),
              ...(patch.content !== undefined && { content: patch.content }),
            };

            if (patch.key !== undefined && patch.key !== oldKey) {
              assertKeyedEntityKeyAvailable(await indexer.notes.findAll(), updated, "A note");
            }

            const newFilePath = joinCategoryPath(updated.category, updated.key);

            await writeFileWithCaseSafeRename({
              entityRoot: join(context.vaultPath, "notes"),
              oldRelativePath: indexed.filePath,
              newRelativePath: newFilePath,
              tempSeed: uuid,
              writeFile: () => getVault(context).notes.write(updated),
              pruneParentsOnMove: true,
            });

            const absolutePath = join(context.vaultPath, "notes", newFilePath);
            const rawContent = await Bun.file(absolutePath).text();
            const vaultDatabase = getVaultDatabase(context);

            const cascadePayload =
              patch.key !== undefined && patch.key !== oldKey
                ? await cascadeNoteKeyRename(context, oldKey, updated.key, uuid)
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
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
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
        return withVaultWriteLock(context.vaultPath, async () => {
          const allReferences = await getVaultIndexer(context).references.findAll();
          assertKeyedEntityKeyAvailable(allReferences, reference, "A reference");

          await getVault(context).references.write(reference);

          // Inline DB update — closes the stale-index window for API-originated writes.
          const entityRelativePath = joinCategoryPath(reference.category, reference.key);
          const absolutePath = join(context.vaultPath, "references", entityRelativePath);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          vaultDatabase.transaction((tx) => {
            upsertReference(tx, reference, entityRelativePath, rawContent);
          });
        });
      },

      async update(
        context: ProjectContext,
        uuid: string,
        patch: ReferenceUpdate,
      ): Promise<ReferenceUpdateResponse> {
        return withVaultWriteLock(context.vaultPath, async () => {
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
              ...(patch.category !== undefined && { category: patch.category ?? undefined }),
              ...(patch.content !== undefined && { content: patch.content }),
            };

            if (patch.key !== undefined && patch.key !== oldKey) {
              assertKeyedEntityKeyAvailable(
                await indexer.references.findAll(),
                updated,
                "A reference",
              );
            }

            const newFilePath = joinCategoryPath(updated.category, updated.key);

            await writeFileWithCaseSafeRename({
              entityRoot: join(context.vaultPath, "references"),
              oldRelativePath: indexed.filePath,
              newRelativePath: newFilePath,
              tempSeed: uuid,
              writeFile: () => getVault(context).references.write(updated),
              pruneParentsOnMove: true,
            });

            const absolutePath = join(context.vaultPath, "references", newFilePath);
            const rawContent = await Bun.file(absolutePath).text();
            const vaultDatabase = getVaultDatabase(context);

            const cascadePayload =
              patch.key !== undefined && patch.key !== oldKey
                ? await cascadeReferenceKeyRename(context, oldKey, updated.key, uuid)
                : null;

            const warnings = cascadePayload
              ? { fragments: cascadePayload.fragments }
              : { fragments: [] };

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
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
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

          // Strip the reference from every fragment's reference list (inline links stay, becoming
          // broken). Computed before the delete-by-path so the cascade reads the live files.
          const cascadePayload = await cascadeReferenceDelete(context, indexed.key);

          const vaultDatabase = getVaultDatabase(context);
          vaultDatabase.transaction((tx) => {
            deleteReferenceByFilePath(tx, indexed.filePath);
            cascadePayload.commit(tx);
          });
        });
      },
    },

    // Arc operations (vault-stored, not DB-indexed)

    arcs: {
      read: readArc,
      write: async (context: ProjectContext, arc: Arc): Promise<void> => {
        return withVaultWriteLock(context.vaultPath, () => writeArc(context, arc));
      },
      delete: async (context: ProjectContext, aspectKey: string): Promise<void> => {
        return withVaultWriteLock(context.vaultPath, () => deleteArc(context, aspectKey));
      },
    },

    // Import archive: the original uploaded file kept byte-for-byte under
    // .maskor/imports/ so a sequence's origin can point back at what was
    // imported. The watcher ignores .maskor/, so archived binaries are never
    // adopted as fragments.

    imports: {
      async archive(
        context: ProjectContext,
        archiveFileName: string,
        bytes: Uint8Array,
      ): Promise<string> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const importsDirectory = join(context.vaultPath, ".maskor", "imports");
          await mkdir(importsDirectory, { recursive: true });
          await Bun.write(join(importsDirectory, archiveFileName), bytes);
          return join(".maskor", "imports", archiveFileName);
        });
      },
    },

    // Export archive: the assembled output kept byte-for-byte under
    // .maskor/exports/ as a durable record of each export. The watcher
    // ignores .maskor/, so archived files are never adopted as fragments.

    exports: {
      async archive(
        context: ProjectContext,
        archiveFileName: string,
        bytes: Uint8Array,
      ): Promise<string> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const exportsDirectory = join(context.vaultPath, ".maskor", "exports");
          await mkdir(exportsDirectory, { recursive: true });
          await Bun.write(join(exportsDirectory, archiveFileName), bytes);
          return join(".maskor", "exports", archiveFileName);
        });
      },
    },

    // Document-link queries (read-only; the link index is maintained by the upsert/cascade paths).

    links: {
      async backlinks(context: ProjectContext, targetType: LinkEntityKind, targetKey: string) {
        return getVaultIndexer(context).links.findBacklinks(targetType, targetKey);
      },
      async outgoing(
        context: ProjectContext,
        sourceType: "fragment" | "note" | "reference",
        sourceUuid: string,
      ) {
        return getVaultIndexer(context).links.findOutgoing(sourceType, sourceUuid);
      },
    },

    // Suggestion operations

    suggestion: {
      async getCurrent(context: ProjectContext) {
        return withVaultWriteLock(context.vaultPath, async () => {
          const vaultDatabase = getVaultDatabase(context);
          const currentFragmentUUID = getCurrentFragmentUUID(vaultDatabase);

          if (!currentFragmentUUID) {
            return {
              fragmentUuid: null,
              avoidanceCount: 0,
            };
          }

          const fragmentStats = getStats(vaultDatabase, currentFragmentUUID);
          return {
            fragmentUuid: currentFragmentUUID,
            avoidanceCount: fragmentStats.avoidanceCount,
          };
        });
      },

      // Returns the next suggested fragment UUID and its avoidance count, or null if the pool
      // is empty. If excludeUuid is provided and was surfaced in this session without being
      // edited, its avoidance_count is incremented before selection.
      // readinessThreshold: fragments at or above this value are excluded (default 0.95).
      async getNext(
        context: ProjectContext,
        excludeUuid?: string,
        readinessThreshold = 0.95,
      ): Promise<{ fragmentUuid: string | null; avoidanceCount: number }> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const vaultDatabase = getVaultDatabase(context);
          const indexer = getVaultIndexer(context);
          const cooldown = getSuggestionCooldown(context);

          if (
            excludeUuid &&
            cooldown.has(excludeUuid) &&
            !cooldown.wasEditedWhileSurfaced(excludeUuid) &&
            !cooldown.wasUserPicked(excludeUuid)
          ) {
            incrementAvoidance(vaultDatabase, excludeUuid);
          }

          const allFragments = await indexer.fragments.findAll();
          const preFilter = allFragments.filter(
            (fragment) => !fragment.isDiscarded && fragment.readiness < readinessThreshold,
          );

          if (preFilter.length === 0) {
            return { fragmentUuid: null, avoidanceCount: 0 };
          }

          const eligibleUuids = cooldown.getEligible(preFilter.map((fragment) => fragment.uuid));
          const eligibleSet = new Set(eligibleUuids);
          const eligible = preFilter.filter((fragment) => eligibleSet.has(fragment.uuid));

          // Exclude the current fragment from selection when alternatives exist, so Next never
          // returns the same fragment that was just on screen.
          const selectionPool =
            excludeUuid && eligible.length > 1
              ? eligible.filter((fragment) => fragment.uuid !== excludeUuid)
              : eligible;

          const statsMap = getStatsBatch(
            vaultDatabase,
            selectionPool.map((fragment) => fragment.uuid),
          );

          const selectedUuid = selectNextSuggestion({
            eligibleFragments: selectionPool.map((fragment) => ({
              uuid: fragment.uuid,
              readiness: fragment.readiness,
            })),
            stats: statsMap,
            rng: Math.random,
          });

          if (!selectedUuid) {
            return { fragmentUuid: null, avoidanceCount: 0 };
          }

          const surfacedAt = new Date();
          cooldown.add(selectedUuid);
          incrementPromptAccept(vaultDatabase, selectedUuid, surfacedAt);
          setCurrentFragmentUUID(vaultDatabase, selectedUuid);

          const fragmentStats = getStats(vaultDatabase, selectedUuid);
          return { fragmentUuid: selectedUuid, avoidanceCount: fragmentStats.avoidanceCount };
        });
      },

      async setCurrent(context: ProjectContext, fragmentUuid: string): Promise<void> {
        await withVaultWriteLock(context.vaultPath, async () => {
          const vaultDatabase = getVaultDatabase(context);
          setCurrentFragmentUUID(vaultDatabase, fragmentUuid);
        });
      },

      async recordVisit(context: ProjectContext, fragmentUuid: string): Promise<void> {
        await withVaultWriteLock(context.vaultPath, async () => {
          const vaultDatabase = getVaultDatabase(context);
          incrementVoluntaryOpen(vaultDatabase, fragmentUuid);
        });
      },

      // Explicit user pick (e.g. quick-switcher). Bumps voluntary_open_count,
      // adds the fragment to cooldown so the engine does not immediately
      // re-surface it on Next, and marks it user-picked so the next
      // getNext() call skips avoidance accounting for it.
      async recordPick(context: ProjectContext, fragmentUuid: string): Promise<void> {
        await withVaultWriteLock(context.vaultPath, async () => {
          const vaultDatabase = getVaultDatabase(context);
          const cooldown = getSuggestionCooldown(context);
          incrementVoluntaryOpen(vaultDatabase, fragmentUuid);
          cooldown.add(fragmentUuid);
          cooldown.markUserPicked(fragmentUuid);
        });
      },

      async recordEditSaved(context: ProjectContext, fragmentUuid: string): Promise<void> {
        await withVaultWriteLock(context.vaultPath, async () => {
          const vaultDatabase = getVaultDatabase(context);
          const cooldown = getSuggestionCooldown(context);
          // Only increment once per session (surfaced → navigated away).
          // If the fragment has already been marked edited in this cooldown window,
          // skip the DB increment to avoid counting every save as a separate edit.
          if (!cooldown.wasEditedWhileSurfaced(fragmentUuid)) {
            incrementEdit(vaultDatabase, fragmentUuid);
          }
          cooldown.markEdited(fragmentUuid);
        });
      },

      getFragmentStats(context: ProjectContext, fragmentUuid: string): FragmentStats {
        const vaultDatabase = getVaultDatabase(context);
        return getStats(vaultDatabase, fragmentUuid);
      },
    },

    // Sequence operations

    sequences: {
      async read(context: ProjectContext, uuid: string): Promise<IndexedSequence> {
        const indexed = await getVaultIndexer(context).sequences.findByUUID(uuid);

        if (!indexed) {
          throw new VaultError("SEQUENCE_NOT_FOUND", `Sequence "${uuid}" not found in index`, {
            uuid,
            reason: "UUID not present in vault index",
          });
        }

        return indexed;
      },

      async readAll(context: ProjectContext): Promise<IndexedSequence[]> {
        return getVaultIndexer(context).sequences.findAll();
      },

      async getMain(context: ProjectContext): Promise<IndexedSequence | null> {
        return getVaultIndexer(context).sequences.findMain();
      },

      async write(context: ProjectContext, sequence: Sequence): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const allSequences = await getVaultIndexer(context).sequences.findAll();

          if (allSequences.some((s) => s.uuid !== sequence.uuid && s.name === sequence.name)) {
            throw new VaultError(
              "KEY_CONFLICT",
              `A sequence named "${sequence.name}" already exists in this project`,
              { reason: "name_conflict" },
            );
          }

          if (sequence.isMain && allSequences.some((s) => s.uuid !== sequence.uuid && s.isMain)) {
            throw new VaultError(
              "KEY_CONFLICT",
              `Another main sequence already exists. Use setMain to promote a sequence.`,
              { reason: "main_conflict" },
            );
          }

          await getVault(context).sequences.write(sequence);

          const filename = `${sequence.uuid}.yaml`;
          const absolutePath = join(context.vaultPath, ".maskor", "sequences", filename);
          const rawContent = await Bun.file(absolutePath).text();
          const vaultDatabase = getVaultDatabase(context);

          vaultDatabase.transaction((tx) => {
            upsertSequence(tx, sequence, filename, rawContent);
          });
        });
      },

      async delete(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const indexer = getVaultIndexer(context);
          const indexed = await indexer.sequences.findByUUID(uuid);

          if (!indexed) {
            throw new VaultError(
              "SEQUENCE_NOT_FOUND",
              `Cannot delete: sequence "${uuid}" not found in index`,
              { uuid, reason: "UUID not present in vault index" },
            );
          }

          try {
            await getVault(context).sequences.delete(indexed.filePath);
          } catch (error) {
            if (error instanceof VaultError && error.code === "SEQUENCE_NOT_FOUND") {
              log.warn(
                { uuid, filePath: indexed.filePath },
                "stale index: sequence file missing on delete",
              );
              throw new VaultError(
                "STALE_INDEX",
                `Cannot delete: sequence "${uuid}" file missing — index may be stale`,
                { uuid, filePath: indexed.filePath },
              );
            }
            throw error;
          }

          const vaultDatabase = getVaultDatabase(context);
          vaultDatabase.transaction((tx) => {
            deleteSequenceByFilePath(tx, indexed.filePath);
          });
        });
      },

      async setMain(context: ProjectContext, uuid: string): Promise<void> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const indexer = getVaultIndexer(context);
          const indexed = await indexer.sequences.findByUUID(uuid);

          if (!indexed) {
            throw new VaultError(
              "SEQUENCE_NOT_FOUND",
              `Cannot set main: sequence "${uuid}" not found in index`,
              { uuid, reason: "UUID not present in vault index" },
            );
          }

          if (indexed.isMain) return;

          const vault = getVault(context);
          const vaultDatabase = getVaultDatabase(context);
          const currentMain = await indexer.sequences.findMain();

          const sequenceToPromote = await vault.sequences.read(indexed.filePath);
          const promoted = { ...sequenceToPromote, isMain: true };

          if (currentMain) {
            const currentMainSequence = await vault.sequences.read(currentMain.filePath);
            const demoted = { ...currentMainSequence, isMain: false };

            // Demote first so there is never a window with two isMain:true files on disk,
            // which would race the watcher's upsertSequence against the partial-unique index.
            await vault.sequences.write(demoted);
            const demotedAbsolutePath = join(
              context.vaultPath,
              ".maskor",
              "sequences",
              currentMain.filePath,
            );
            const demotedRawContent = await Bun.file(demotedAbsolutePath).text();

            await vault.sequences.write(promoted);
            const promotedAbsolutePath = join(
              context.vaultPath,
              ".maskor",
              "sequences",
              indexed.filePath,
            );
            const promotedRawContent = await Bun.file(promotedAbsolutePath).text();

            vaultDatabase.transaction((tx) => {
              upsertSequence(tx, demoted, currentMain.filePath, demotedRawContent);
              upsertSequence(tx, promoted, indexed.filePath, promotedRawContent);
            });
          } else {
            await vault.sequences.write(promoted);
            const promotedAbsolutePath = join(
              context.vaultPath,
              ".maskor",
              "sequences",
              indexed.filePath,
            );
            const promotedRawContent = await Bun.file(promotedAbsolutePath).text();

            vaultDatabase.transaction((tx) => {
              upsertSequence(tx, promoted, indexed.filePath, promotedRawContent);
            });
          }
        });
      },
    },

    // Action log operations

    actionLog: {
      async append(context: ProjectContext, entry: LogEntry): Promise<void> {
        const writer = await getActionLogWriter(context);
        await writer.append(entry);
      },

      async readRecent(context: ProjectContext, limit: number): Promise<LogEntry[]> {
        return readRecentEntries(context.vaultPath, limit, logger);
      },
    },

    // Swap operations — transient unsaved-content cache. See packages/storage/CLAUDE.md
    // for why these bypass withVaultWriteLock and the action log.
    swap: {
      async write(
        context: ProjectContext,
        entityType: SwapEntityType,
        entityUUID: string,
        content: string,
      ): Promise<SwapFile> {
        return getSwapStorage(context).write(entityType, entityUUID, content);
      },

      async read(
        context: ProjectContext,
        entityType: SwapEntityType,
        entityUUID: string,
      ): Promise<SwapFile | null> {
        return getSwapStorage(context).read(entityType, entityUUID);
      },

      async delete(
        context: ProjectContext,
        entityType: SwapEntityType,
        entityUUID: string,
      ): Promise<void> {
        return getSwapStorage(context).delete(entityType, entityUUID);
      },

      async list(context: ProjectContext): Promise<SwapListEntry[]> {
        return getSwapStorage(context).list();
      },
    },

    // Stats operations

    stats: {
      getForFragment(context: ProjectContext, fragmentUuid: string): FragmentStats {
        const vaultDatabase = getVaultDatabase(context);
        return getStats(vaultDatabase, fragmentUuid);
      },

      getForProject(context: ProjectContext): ProjectStats {
        const vaultDatabase = getVaultDatabase(context);
        return getStatsForProject(vaultDatabase);
      },
    },

    // Index operations

    index: {
      async rebuild(context: ProjectContext): Promise<RebuildStats> {
        // Pause the watcher during rebuild to prevent the watcher/rebuild race:
        // a watcher event mid-rebuild would be overwritten by rebuild's stale snapshot.
        const watcher = getVaultWatcher(context);
        await watcher.pause();
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

      // Manual, on-demand hard reset: drop the vault DB and re-derive it from the vault. Unlike
      // rebuild (which re-derives row contents through the live schema), this recreates the DB
      // file, so it recovers from schema drift, a half-failed migration, or a corrupt .db that
      // rebuild cannot repair. Reuses the draft-restore teardown: it is the same "replace vault.db
      // on disk, then rebuild" pipeline, minus the snapshot swap.
      //
      // Destructive: discards DB-only state (fragment_stats telemetry, dismissed UUID_COLLISION
      // warnings) that no vault file carries. This is an explicit user action, so it is NOT gated
      // by MASKOR_DB_AUTO_RESET (that flag scopes only the automatic startup reset).
      async reset(context: ProjectContext): Promise<RebuildStats> {
        return withDraftMutex(context.vaultPath, async () => {
          return withVaultWriteLock(context.vaultPath, async () => {
            log.warn(
              { projectUUID: context.projectUUID },
              "manual DB reset: dropping and re-deriving vault.db " +
                "(fragment_stats telemetry and dismissed UUID_COLLISION warnings discarded)",
            );

            // Stop the watcher entirely: the live vault.db is about to be deleted, and the
            // watcher's cached drizzle wrapper points at the old inode.
            const oldWatcher = vaultWatcherCache.get(context.projectUUID);
            if (oldWatcher) {
              await oldWatcher.pause();
              await oldWatcher.stop();
            }

            // Close the raw handle and drop every cache that closed over the old DB / vault
            // handle, then delete the DB files so the next getVaultDatabase opens a fresh
            // connection that re-migrates and re-stamps the schema fingerprint.
            closeRawVaultDatabase(context.vaultPath);
            vaultDatabaseCache.delete(context.projectUUID);
            vaultIndexerCache.delete(context.projectUUID);
            vaultWatcherCache.delete(context.projectUUID);
            deleteVaultDatabaseFiles(context.vaultPath);

            // Re-derive the index from the vault into the freshly created DB. A failed rebuild
            // still leaves a freshly migrated (empty) DB on disk, so the watcher can run against
            // it — restart the watcher before surfacing the failure, otherwise live sync would be
            // left dead until the next project resolve.
            let stats: RebuildStats;
            try {
              stats = await getVaultIndexer(context).rebuild();
            } catch (error) {
              getVaultWatcher(context).start();
              throw error;
            }

            // Start a fresh watcher on the new database. The subscriber bus lives on the service,
            // so existing SSE clients keep receiving events through the new watcher.
            getVaultWatcher(context).start();

            emitVaultEvent(context.projectUUID, { type: "vault:reset" });

            log.info(
              { projectUUID: context.projectUUID, fragments: stats.fragments },
              "manual DB reset complete",
            );
            return stats;
          });
        });
      },
    },

    // Warning operations

    warnings: {
      list(context: ProjectContext): StoredWarning[] {
        return listWarnings(getVaultDatabase(context));
      },

      // Dismisses an event warning. State warnings cannot be dismissed (they clear by fixing
      // the cause) — returns "not_event" for them and "not_found" for an unknown id. Wrapped in
      // the vault write lock since it mutates vault.db, which draft snapshots capture.
      async dismiss(context: ProjectContext, id: string): Promise<DismissResult> {
        return withVaultWriteLock(context.vaultPath, async () => {
          const result = dismissWarning(getVaultDatabase(context), id);
          if (result === "dismissed") {
            emitVaultEvent(context.projectUUID, { type: "vault:warning" });
          }
          return result;
        });
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
        let set = eventSubscribers.get(context.projectUUID);
        if (!set) {
          set = new Set();
          eventSubscribers.set(context.projectUUID, set);
        }
        set.add(callback);
        return () => {
          set?.delete(callback);
        };
      },
    },

    // Draft operations

    drafts: {
      async create(
        context: ProjectContext,
        input: { name: string; note?: string },
      ): Promise<DraftManifest> {
        // withDraftMutex rejects concurrent draft ops with DRAFT_OPERATION_IN_PROGRESS.
        // withVaultWriteLock blocks (queues) concurrent storage writes so the snapshot
        // doesn't race fragment / aspect / note writes mid-copy.
        return withDraftMutex(context.vaultPath, async () => {
          return withVaultWriteLock(context.vaultPath, async () => {
            const watcher = getVaultWatcher(context);
            const vaultDatabase = getVaultDatabase(context);
            await watcher.pause();
            try {
              return await createDraft({
                vaultPath: context.vaultPath,
                vaultDatabase,
                name: input.name,
                note: input.note,
                logger,
              });
            } finally {
              watcher.resume();
            }
          });
        });
      },

      async list(context: ProjectContext): Promise<ListedDraft[]> {
        return listDrafts(context.vaultPath, logger);
      },

      async delete(context: ProjectContext, uuid: string): Promise<DraftManifest> {
        return deleteDraft(context.vaultPath, uuid, logger);
      },

      async restore(context: ProjectContext, uuid: string): Promise<DraftManifest> {
        return withDraftMutex(context.vaultPath, async () => {
          return withVaultWriteLock(context.vaultPath, async () => {
            // Stop the watcher entirely (not just pause): the live vault.db is
            // about to be replaced on disk, and the watcher's cached drizzle
            // wrapper points at the old inode.
            const oldWatcher = vaultWatcherCache.get(context.projectUUID);
            if (oldWatcher) {
              await oldWatcher.pause();
              await oldWatcher.stop();
            }

            const result = await restoreDraft({
              vaultPath: context.vaultPath,
              uuid,
              logger,
            });

            // Close the raw bun:sqlite handle so the new file at the same
            // path is opened freshly. Drop every cache that closed over the
            // old database or vault handle.
            closeRawVaultDatabase(context.vaultPath);
            vaultDatabaseCache.delete(context.projectUUID);
            vaultIndexerCache.delete(context.projectUUID);
            vaultWatcherCache.delete(context.projectUUID);

            // Rebuild the index from the restored vault files. The snapshotted
            // vault.db is present but not trusted as the live DB — vault stays
            // source of truth per storage-sync.md.
            await getVaultIndexer(context).rebuild();

            // Start a fresh watcher on the freshly opened database. Subscriber
            // bus lives on the service, so existing SSE clients keep receiving
            // events through the new watcher without re-subscribing.
            getVaultWatcher(context).start();

            emitVaultEvent(context.projectUUID, {
              type: "vault:restored",
              draftUuid: result.draft.uuid,
            });

            return result.draft;
          });
        });
      },
    },
  };
};

export type StorageService = ReturnType<typeof createStorageService>;
