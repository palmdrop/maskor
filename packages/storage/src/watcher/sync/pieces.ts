import path from "node:path";
import type { Logger, VaultSyncEvent } from "@maskor/shared";
import type { VaultDatabase } from "../../db/vault";
import type { Vault } from "../../vault/types";
import { loadKnownAspectKeys, upsertFragment } from "../../indexer/upserts";

export const syncPieces = async (
  vaultDatabase: VaultDatabase,
  vault: Vault,
  emit: (event: VaultSyncEvent) => void,
  log: Logger,
  pieceFileName: string,
): Promise<void> => {
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
  const absoluteFragmentPath = path.join(vault.root, "fragments", entityRelativePath);
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
