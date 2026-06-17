import { basename } from "node:path";
import type { Fragment, VaultSyncEvent } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { VaultDatabase } from "../../db/vault";
import type { RenameBuffer } from "../utils/rename-buffer";
import { fragmentAspectsTable, fragmentsTable } from "../../db/vault/schema";
import { parseEntityFileOrThrow } from "../../vault/markdown/parse";
import * as fragmentMapper from "../../vault/markdown/mappers/fragment";
import { serializeFile } from "../../vault/markdown/serialize";
import { applyInlineLinkMetadata } from "../../vault/markdown/inline-link-metadata";
import { hashContent } from "../../utils/hash";
import {
  loadKnownAspectKeys,
  upsertFragment,
  deleteFragmentByFilePath,
} from "../../indexer/upserts";
import { insertWarning } from "../../warnings/warnings-repo";
import { reconcileUnknownAspectKeyWarnings } from "../../warnings/reconcile";
import { eq } from "drizzle-orm";
import { findFragmentUuidCollision } from "../utils/fragments";
import { readFileWithEnoentGuard } from "../utils/file";
import {
  ensureUuid,
  assignNewUuid,
  writeBackFragmentFrontmatter,
} from "../../vault/markdown/adopt";
import { setWordCount } from "../../suggestion/stats-repo";
import { computeWordCount } from "../../suggestion/word-count";

// Whether two fragments carry the same auto-syncable metadata (references + aspect weights). Used to
// decide whether the inline-link merge actually changed anything and a file write-back is warranted.
const fragmentMetadataEqual = (a: Fragment, b: Fragment): boolean => {
  if (a.references.length !== b.references.length) return false;
  const referencesB = new Set(b.references);
  if (!a.references.every((reference) => referencesB.has(reference))) return false;

  const aspectKeysA = Object.keys(a.aspects);
  const aspectKeysB = Object.keys(b.aspects);
  if (aspectKeysA.length !== aspectKeysB.length) return false;
  return aspectKeysA.every((key) => a.aspects[key]?.weight === b.aspects[key]?.weight);
};

// Rename support mirrors the keyed-entity sync: a deferred unlink (rename buffer) lets a following add
// on the same UUID be recognised as a rename, and a fragment key change rewrites `[[fragments/oldKey]]`
// links in every referring body via the cascade callback.
type FragmentRenameOptions = {
  renameBuffer: RenameBuffer;
  cascadeRename?: (oldKey: string, newKey: string, renamedUuid: string) => Promise<void>;
};

export const syncFragment = async (
  vaultDatabase: VaultDatabase,
  emit: (event: VaultSyncEvent) => void,
  log: Logger,
  absolutePath: string,
  entityRelativePath: string,
  renameOptions: FragmentRenameOptions,
): Promise<void> => {
  // Fragments must live at fragments/<key>.md or fragments/discarded/<key>.md.
  // Any other nesting is invalid; surface as a warning and skip indexing so the
  // file stays on disk but does not pollute the index.
  const normalizedPath = entityRelativePath.replace(/\\/g, "/");
  const isDiscarded = normalizedPath.startsWith("discarded/");
  const segmentCount = normalizedPath.split("/").length;
  if (segmentCount > 1 && !(isDiscarded && segmentCount === 2)) {
    log.warn(
      { filePath: entityRelativePath },
      "watcher: nested fragment rejected — fragments must be at root or in discarded/",
    );
    return;
  }

  const rawContentOrNull = await readFileWithEnoentGuard(absolutePath, "fragment", log);
  if (rawContentOrNull === null) return;

  // Throws VaultError("INVALID_ENTITY_FILE") on malformed frontmatter — the watcher records a
  // warning and skips. This runs before any writeback, so an unparseable file is never rewritten.
  const parsed = parseEntityFileOrThrow(rawContentOrNull, entityRelativePath);

  // writeBack: false — when the UUID is freshly minted the adoption branch below writes the full
  // canonical frontmatter, so a UUID-only write here would just be overwritten. When the UUID
  // already exists no write happens either way.
  const { uuid, rawContent, wasAssigned } = await ensureUuid(
    parsed,
    absolutePath,
    rawContentOrNull,
    log,
    "fragment",
    { writeBack: false },
  );

  // Rename detection (mirrors syncKeyedEntity), run before the collision check. The old filename's
  // unlink is deferred via the rename buffer, so a buffered entry on this UUID means the same fragment
  // was renamed — not a genuine UUID collision. Recognising it here skips the collision reassignment
  // below, which would otherwise mint a new UUID because the old row still lingers in the index.
  //
  // Limitation: this relies on the unlink(old) arriving before (or within the buffer window of) the
  // add(new) — the order chokidar emits for a `mv`/Obsidian rename. If a platform ever delivers
  // add-before-unlink, the buffer is still empty here, the collision check mints a new UUID, and the
  // rename degrades to a delete + fresh-add (referring links go broken, no cascade) — exactly the
  // pre-existing fragment-collision behaviour. Keyed entities share this constraint. See
  // references/suggestions.md.
  const { renameBuffer, cascadeRename } = renameOptions;
  const filenameKey = basename(normalizedPath, ".md");
  const renameCheck = renameBuffer.check(uuid, filenameKey);
  const isBufferRename = renameCheck?.kind === "rename";

  if (renameCheck?.kind === "collision") {
    // A different file took this key slot — drop the buffered (now-stale) source row.
    vaultDatabase.transaction((tx) => deleteFragmentByFilePath(tx, renameCheck.filePath));
    emit({ type: "fragment:deleted", filePath: renameCheck.filePath });
  }

  // Collision check only needed when UUID was already present (not freshly minted) and this is not a
  // recognised rename of the same fragment.
  let resolvedUuid = uuid;
  let resolvedRawContent = rawContent;
  // Set during adoption so the DB upsert below reuses the exact fragment that was serialized to
  // disk — avoids a second fromFile() call whose fresh `new Date()` would drift updatedAt apart.
  let adoptedFragment: Fragment | null = null;
  if (wasAssigned) {
    // New fragment adoption: write back complete canonical frontmatter. The shared helper derives
    // read-time defaults (readiness, notes, references, etc.), preserving any fields the user
    // already supplied. The UUID was already assigned above. Shared with the indexer rebuild.
    const adopted = await writeBackFragmentFrontmatter(parsed, absolutePath, entityRelativePath);
    adoptedFragment = adopted.fragment;
    resolvedRawContent = adopted.rawContent;
  } else if (!isBufferRename) {
    const collision = findFragmentUuidCollision(vaultDatabase, uuid, entityRelativePath);
    if (collision) {
      const { uuid: newUuid, rawContent: newRawContent } = await assignNewUuid(
        parsed,
        absolutePath,
        log,
        "fragment",
      );
      log.warn(
        { filePath: entityRelativePath, collidingPath: collision, newUuid },
        "watcher: UUID collision resolved — new UUID assigned",
      );
      // Record an event warning the user can inspect later. Event warnings persist until
      // dismissed and are never re-derived on rebuild. Paths are stored vault-root-relative.
      insertWarning(vaultDatabase, {
        kind: "UUID_COLLISION",
        filePath: `fragments/${normalizedPath}`,
        collidingPath: `fragments/${collision.replace(/\\/g, "/")}`,
        newUuid,
      });
      emit({ type: "vault:warning" });
      resolvedUuid = newUuid;
      resolvedRawContent = newRawContent;
    }
  }

  // Cascade a buffer rename whose key actually changed (a discard/restore move keeps the same key).
  if (isBufferRename && renameCheck.oldKey !== filenameKey && cascadeRename) {
    await cascadeRename(renameCheck.oldKey, filenameKey, resolvedUuid);
  }

  const storedRow = vaultDatabase
    .select({ key: fragmentsTable.key, contentHash: fragmentsTable.contentHash })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.uuid, resolvedUuid))
    .get();

  // DB-rename detection only when no buffer rename was seen — the row exists under a different key
  // (a Maskor-internal rename after a rebuild, or an external rename whose unlink never buffered). The
  // hash-guard early-return is skipped on either rename path so the key change is committed below.
  if (!isBufferRename) {
    const isDbRename = storedRow !== undefined && storedRow.key !== filenameKey;
    if (isDbRename && cascadeRename) {
      await cascadeRename(storedRow.key, filenameKey, resolvedUuid);
    }
    if (!isDbRename && storedRow?.contentHash === hashContent(resolvedRawContent)) {
      log.debug(
        { filePath: entityRelativePath },
        "watcher: fragment unchanged (hash match) — skipping",
      );
      return;
    }
  }

  const parsedFragment = adoptedFragment ?? fragmentMapper.fromFile(parsed, entityRelativePath);

  // Auto-sync inline `[[references/…]]` / `[[aspects/…]]` links into metadata (document-links.md).
  // We are past the hash guard, so this is a genuine external body edit — reap weight-0 aspects whose
  // inline link is gone. When the merge changes metadata, write the canonical file back (the resulting
  // watcher event hash-guards to a no-op because the merge is idempotent).
  const fragment = applyInlineLinkMetadata(parsedFragment, true);
  let indexedRawContent = resolvedRawContent;
  if (!fragmentMetadataEqual(parsedFragment, fragment)) {
    const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
    indexedRawContent = serializeFile({ frontmatter, inlineFields, body });
    await Bun.write(absolutePath, indexedRawContent);
  }

  const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

  // Aspect keys this fragment referenced before the upsert. Combined with its new keys, these
  // are the keys whose UNKNOWN_ASPECT_KEY warning may need to change as a result of this sync.
  const previousAspectKeys = vaultDatabase
    .select({ aspectKey: fragmentAspectsTable.aspectKey })
    .from(fragmentAspectsTable)
    .where(eq(fragmentAspectsTable.fragmentUuid, resolvedUuid))
    .all()
    .map((row) => row.aspectKey);

  const warnings = vaultDatabase.transaction((tx) => {
    return upsertFragment(tx, fragment, entityRelativePath, indexedRawContent, knownAspectKeys);
  });

  setWordCount(vaultDatabase, resolvedUuid, computeWordCount(fragment.content));

  emit({ type: "fragment:synced", uuid: resolvedUuid });

  // The fragment body carries the anchor markers, but the Margin's orphan state is not stored in the
  // index (the panel derives it live from the open buffer) and the Margin file itself is untouched by
  // a fragment edit — so there is nothing in the Margin index to update here.

  for (const warning of warnings) {
    log.warn(
      { aspectKey: warning.aspectKey, fragmentUuids: warning.fragmentUuids },
      "watcher: unknown aspect key on fragment sync",
    );
  }

  // Reconcile UNKNOWN_ASPECT_KEY state warnings for every key this fragment touched (previous ∪
  // new). Rebuild remains authoritative — this is best-effort incremental upkeep.
  const affectedAspectKeys = new Set<string>([
    ...previousAspectKeys,
    ...Object.keys(fragment.aspects),
  ]);
  if (reconcileUnknownAspectKeyWarnings(vaultDatabase, affectedAspectKeys, knownAspectKeys)) {
    emit({ type: "vault:warning" });
  }

  log.debug({ filePath: entityRelativePath }, "watcher: fragment synced");
};

export const unlinkFragment = (
  vaultDatabase: VaultDatabase,
  emit: (event: VaultSyncEvent) => void,
  entityRelativePath: string,
  renameBuffer: RenameBuffer,
): void => {
  // Capture the aspect keys this fragment referenced before deleting it, so we can reconcile their
  // UNKNOWN_ASPECT_KEY warnings afterwards: a removed fragment may have been the last referencer of
  // an unknown key, which should clear the warning.
  const storedRow = vaultDatabase
    .select({ uuid: fragmentsTable.uuid, key: fragmentsTable.key })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.filePath, entityRelativePath))
    .get();
  if (!storedRow) return;

  const previousAspectKeys = vaultDatabase
    .select({ aspectKey: fragmentAspectsTable.aspectKey })
    .from(fragmentAspectsTable)
    .where(eq(fragmentAspectsTable.fragmentUuid, storedRow.uuid))
    .all()
    .map((row) => row.aspectKey);

  // Defer the delete ~RENAME_BUFFER_MS so a following add on the same UUID is recognised as a rename
  // (and the cascade fires) instead of a delete-then-fresh-add that would orphan referring links. A
  // rename cancels this callback. See the watcher-lifetime caveat in sync/keyed-entity.ts.
  renameBuffer.add(storedRow.uuid, storedRow.key, entityRelativePath, () => {
    vaultDatabase.transaction((tx) => {
      deleteFragmentByFilePath(tx, entityRelativePath);
    });

    emit({ type: "fragment:deleted", filePath: entityRelativePath });

    const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);
    if (reconcileUnknownAspectKeyWarnings(vaultDatabase, previousAspectKeys, knownAspectKeys)) {
      emit({ type: "vault:warning" });
    }
  });
};
