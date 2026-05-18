import { mkdir, rename, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "@maskor/shared";
import {
  RESTORE_MASKOR_ENTRIES,
  RESTORE_VAULT_DIRECTORIES,
} from "./constants";
import { DraftError } from "./errors";
import { findDraftByUuid, type ListedDraft } from "./list";
import {
  draftDirectory,
  restoreAsideRoot,
} from "./paths";

export type RestoreDraftInput = {
  vaultPath: string;
  uuid: string;
  logger?: Logger;
};

export type RestoreDraftResult = {
  draft: ListedDraft;
};

type RestoreTarget = {
  // Vault-root-relative path of the entry being restored (e.g. "fragments" or ".maskor/sequences").
  relativePath: string;
  // Absolute path on disk: where the live entry lives / where the aside copy goes / where the snapshot lives.
  livePath: string;
  asidePath: string;
  snapshotPath: string;
};

const buildTargets = (vaultPath: string, draftPath: string): RestoreTarget[] => {
  const aside = restoreAsideRoot(vaultPath);
  const targets: RestoreTarget[] = [];
  for (const directory of RESTORE_VAULT_DIRECTORIES) {
    targets.push({
      relativePath: directory,
      livePath: join(vaultPath, directory),
      asidePath: join(aside, directory),
      snapshotPath: join(draftPath, directory),
    });
  }
  for (const entry of RESTORE_MASKOR_ENTRIES) {
    targets.push({
      relativePath: join(".maskor", entry),
      livePath: join(vaultPath, ".maskor", entry),
      asidePath: join(aside, ".maskor", entry),
      snapshotPath: join(draftPath, ".maskor", entry),
    });
  }
  return targets;
};

export const restoreDraft = async (
  input: RestoreDraftInput,
): Promise<RestoreDraftResult> => {
  const { vaultPath, uuid, logger } = input;

  const draft = await findDraftByUuid(vaultPath, uuid, logger);
  if (!draft) {
    throw new DraftError("DRAFT_NOT_FOUND", `No draft with uuid ${uuid}.`, { uuid });
  }

  const draftPath = draftDirectory(vaultPath, draft.directoryName);
  const aside = restoreAsideRoot(vaultPath);

  // Fresh aside root for this restore.
  if (existsSync(aside)) await rm(aside, { recursive: true, force: true });
  await mkdir(aside, { recursive: true });
  await mkdir(join(aside, ".maskor"), { recursive: true });

  const targets = buildTargets(vaultPath, draftPath);
  const movedAside: RestoreTarget[] = [];
  const copiedIntoLive: RestoreTarget[] = [];

  try {
    for (const target of targets) {
      if (existsSync(target.livePath)) {
        await rename(target.livePath, target.asidePath);
        movedAside.push(target);
      }
      if (existsSync(target.snapshotPath)) {
        await cp(target.snapshotPath, target.livePath, { recursive: true });
        copiedIntoLive.push(target);
      }
    }

    // Success — drop the aside copies.
    await rm(aside, { recursive: true, force: true });
    logger?.info({ uuid, directoryName: draft.directoryName }, "draft restored");
    return { draft };
  } catch (error) {
    logger?.error(
      {
        uuid,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      "drafts: restore failed, rolling back",
    );
    // Roll back: remove any copies we placed into live, then move the aside
    // entries back into place. Best-effort — log but don't throw on rollback
    // failures so the original error reaches the caller.
    for (const target of copiedIntoLive) {
      try {
        if (existsSync(target.livePath)) {
          await rm(target.livePath, { recursive: true, force: true });
        }
      } catch (rollbackError) {
        logger?.error(
          {
            relativePath: target.relativePath,
            errorMessage:
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          },
          "drafts: rollback failed to remove copied-into-live entry",
        );
      }
    }
    for (const target of movedAside) {
      try {
        if (existsSync(target.asidePath)) {
          await rename(target.asidePath, target.livePath);
        }
      } catch (rollbackError) {
        logger?.error(
          {
            relativePath: target.relativePath,
            errorMessage:
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          },
          "drafts: rollback failed to rename aside entry back into place",
        );
      }
    }
    try {
      await rm(aside, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw error;
  }
};
