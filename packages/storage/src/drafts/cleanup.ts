import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Logger } from "@maskor/shared";
import { restoreAsideRoot, stagingRoot } from "./paths";

// Spec § Crash recovery: at project resolve, blow away `.staging/` and
// `.restore-aside/` if either exists. Either is evidence of an interrupted
// create or restore — the pre-restore draft (created first when the safety
// checkbox is on) is the user-facing recovery surface, not these scratch
// directories.
export const cleanupStaleDirectories = async (
  vaultPath: string,
  logger?: Logger,
): Promise<void> => {
  const staging = stagingRoot(vaultPath);
  const aside = restoreAsideRoot(vaultPath);

  if (existsSync(staging)) {
    logger?.warn(
      { staging },
      "drafts: removing stale staging directory from interrupted operation",
    );
    await rm(staging, { recursive: true, force: true });
  }
  if (existsSync(aside)) {
    logger?.warn(
      { restoreAside: aside },
      "drafts: removing stale restore-aside directory from interrupted operation",
    );
    await rm(aside, { recursive: true, force: true });
  }
};
