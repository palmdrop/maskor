import path from "node:path";
import type { VaultSyncEvent } from "@maskor/shared";
import { extractCommentMarkerIds } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { VaultDatabase } from "../../db/vault";
import { fragmentsTable, marginsTable } from "../../db/vault/schema";
import { parseEntityFileOrThrow } from "../../vault/markdown/parse";
import * as marginMapper from "../../vault/markdown/mappers/margin";
import { hashContent } from "../../utils/hash";
import { upsertMargin, deleteMarginByFilePath } from "../../indexer/upserts";
import { readFileWithEnoentGuard } from "../utils/file";
import { eq } from "drizzle-orm";

// The marker ids present in a fragment's body, looked up by fragmentUuid. Reads the fragment file
// from disk (the fragments table stores only an excerpt, not the full body). Returns null when the
// fragment is unknown — every comment of an unbound Margin is then orphaned.
const loadFragmentMarkerIds = async (
  vaultDatabase: VaultDatabase,
  vaultRoot: string,
  fragmentUuid: string,
): Promise<Set<string> | null> => {
  const row = vaultDatabase
    .select({ filePath: fragmentsTable.filePath })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.uuid, fragmentUuid))
    .get();
  if (!row) return null;

  const absolutePath = path.join(vaultRoot, "fragments", row.filePath);
  const file = Bun.file(absolutePath);
  if (!(await file.exists())) return null;
  return new Set(extractCommentMarkerIds(await file.text()));
};

export const syncMargin = async (
  vaultDatabase: VaultDatabase,
  vaultRoot: string,
  emit: (event: VaultSyncEvent) => void,
  log: Logger,
  absolutePath: string,
  entityRelativePath: string,
): Promise<void> => {
  const rawContentOrNull = await readFileWithEnoentGuard(absolutePath, "margin", log);
  if (rawContentOrNull === null) return;

  // Throws VaultError("INVALID_ENTITY_FILE") on malformed frontmatter — recorded as a warning by
  // the caller and skipped, file untouched.
  const parsed = parseEntityFileOrThrow(rawContentOrNull, entityRelativePath);
  const margin = marginMapper.fromFile(parsed, entityRelativePath);

  // Hash guard: skip when the stored row already matches this file (idempotent for API writes).
  const storedRow = vaultDatabase
    .select({ contentHash: marginsTable.contentHash, filePath: marginsTable.filePath })
    .from(marginsTable)
    .where(eq(marginsTable.fragmentUuid, margin.fragmentUuid))
    .get();
  if (
    storedRow?.contentHash === hashContent(rawContentOrNull) &&
    storedRow.filePath === entityRelativePath
  ) {
    log.debug(
      { filePath: entityRelativePath },
      "watcher: margin unchanged (hash match) — skipping",
    );
    return;
  }

  const fragmentMarkerIds = await loadFragmentMarkerIds(
    vaultDatabase,
    vaultRoot,
    margin.fragmentUuid,
  );

  vaultDatabase.transaction((tx) => {
    upsertMargin(tx, margin, entityRelativePath, rawContentOrNull, fragmentMarkerIds);
  });

  emit({ type: "margin:synced", fragmentUuid: margin.fragmentUuid });
  log.debug({ filePath: entityRelativePath }, "watcher: margin synced");
};

export const unlinkMargin = (
  vaultDatabase: VaultDatabase,
  emit: (event: VaultSyncEvent) => void,
  entityRelativePath: string,
): void => {
  vaultDatabase.transaction((tx) => {
    deleteMarginByFilePath(tx, entityRelativePath);
  });
  emit({ type: "margin:deleted", filePath: entityRelativePath });
};
