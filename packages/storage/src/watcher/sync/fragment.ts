import type { Logger, VaultSyncEvent } from "@maskor/shared";
import type { VaultDatabase } from "../../db/vault";
import { fragmentsTable } from "../../db/vault/schema";
import { parseFile } from "../../vault/markdown/parse";
import * as fragmentMapper from "../../vault/markdown/mappers/fragment";
import { hashContent } from "../../utils/hash";
import {
  loadKnownAspectKeys,
  upsertFragment,
  deleteFragmentByFilePath,
} from "../../indexer/upserts";
import { eq } from "drizzle-orm";
import { findFragmentUuidCollision } from "../utils/fragments";
import { readFileWithEnoentGuard } from "../utils/file";
import { ensureUuid, assignNewUuid } from "../utils/uuid";
import { setWordCount } from "../../suggestion/stats-repo";
import { computeWordCount } from "../../suggestion/word-count";

export const syncFragment = async (
  vaultDatabase: VaultDatabase,
  emit: (event: VaultSyncEvent) => void,
  log: Logger,
  absolutePath: string,
  entityRelativePath: string,
): Promise<void> => {
  const rawContentOrNull = await readFileWithEnoentGuard(absolutePath, "fragment", log);
  if (rawContentOrNull === null) return;

  const parsed = parseFile(rawContentOrNull);

  const { uuid, rawContent, wasAssigned } = await ensureUuid(
    parsed,
    absolutePath,
    rawContentOrNull,
    log,
    "fragment",
  );

  // Collision check only needed when UUID was already present (not freshly minted).
  let resolvedUuid = uuid;
  let resolvedRawContent = rawContent;
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
      resolvedUuid = newUuid;
      resolvedRawContent = newRawContent;
    }
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

  const fragment = fragmentMapper.fromFile(parsed, entityRelativePath);
  const knownAspectKeys = loadKnownAspectKeys(vaultDatabase);

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

  log.debug({ filePath: entityRelativePath }, "watcher: fragment synced");
};

export const unlinkFragment = (
  vaultDatabase: VaultDatabase,
  emit: (event: VaultSyncEvent) => void,
  entityRelativePath: string,
): void => {
  vaultDatabase.transaction((tx) => {
    deleteFragmentByFilePath(tx, entityRelativePath);
  });
  emit({ type: "fragment:deleted", filePath: entityRelativePath });
};
