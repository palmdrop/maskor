import type { Fragment, VaultSyncEvent } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { VaultDatabase } from "../../db/vault";
import { fragmentAspectsTable, fragmentsTable } from "../../db/vault/schema";
import { parseFile } from "../../vault/markdown/parse";
import * as fragmentMapper from "../../vault/markdown/mappers/fragment";
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
import { ensureUuid, assignNewUuid, writeBackFragmentFrontmatter } from "../../vault/markdown/adopt";
import { setWordCount } from "../../suggestion/stats-repo";
import { computeWordCount } from "../../suggestion/word-count";

export const syncFragment = async (
  vaultDatabase: VaultDatabase,
  emit: (event: VaultSyncEvent) => void,
  log: Logger,
  absolutePath: string,
  entityRelativePath: string,
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

  const parsed = parseFile(rawContentOrNull);

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

  // Collision check only needed when UUID was already present (not freshly minted).
  let resolvedUuid = uuid;
  let resolvedRawContent = rawContent;
  // Set during adoption so the DB upsert below reuses the exact fragment that was serialized to
  // disk — avoids a second fromFile() call whose fresh `new Date()` would drift updatedAt apart.
  let adoptedFragment: Fragment | null = null;
  if (!wasAssigned) {
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
  } else {
    // New fragment adoption: write back complete canonical frontmatter. The shared helper derives
    // read-time defaults (readiness, notes, references, etc.), preserving any fields the user
    // already supplied. The UUID was already assigned above. Shared with the indexer rebuild.
    const adopted = await writeBackFragmentFrontmatter(parsed, absolutePath, entityRelativePath);
    adoptedFragment = adopted.fragment;
    resolvedRawContent = adopted.rawContent;
  }

  const storedRow = vaultDatabase
    .select({ contentHash: fragmentsTable.contentHash })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.uuid, resolvedUuid))
    .get();

  if (storedRow?.contentHash === hashContent(resolvedRawContent)) {
    log.debug(
      { filePath: entityRelativePath },
      "watcher: fragment unchanged (hash match) — skipping",
    );
    return;
  }

  const fragment = adoptedFragment ?? fragmentMapper.fromFile(parsed, entityRelativePath);
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
    return upsertFragment(tx, fragment, entityRelativePath, resolvedRawContent, knownAspectKeys);
  });

  setWordCount(vaultDatabase, resolvedUuid, computeWordCount(fragment.content));

  emit({ type: "fragment:synced", uuid: resolvedUuid });

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
): void => {
  // Capture the aspect keys this fragment referenced before deleting it, so we can reconcile their
  // UNKNOWN_ASPECT_KEY warnings afterwards: a removed fragment may have been the last referencer of
  // an unknown key, which should clear the warning.
  const storedRow = vaultDatabase
    .select({ uuid: fragmentsTable.uuid })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.filePath, entityRelativePath))
    .get();

  const previousAspectKeys = storedRow
    ? vaultDatabase
        .select({ aspectKey: fragmentAspectsTable.aspectKey })
        .from(fragmentAspectsTable)
        .where(eq(fragmentAspectsTable.fragmentUuid, storedRow.uuid))
        .all()
        .map((row) => row.aspectKey)
    : [];

  vaultDatabase.transaction((tx) => {
    deleteFragmentByFilePath(tx, entityRelativePath);
  });

  emit({ type: "fragment:deleted", filePath: entityRelativePath });

  const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);
  if (reconcileUnknownAspectKeyWarnings(vaultDatabase, previousAspectKeys, knownAspectKeys)) {
    emit({ type: "vault:warning" });
  }
};
