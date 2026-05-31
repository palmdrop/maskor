import { rm } from "node:fs/promises";
import type { DraftManifest } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import { DraftError } from "./errors";
import { findDraftByUuid } from "./list";
import { draftDirectory } from "./paths";

export const deleteDraft = async (
  vaultPath: string,
  uuid: string,
  logger?: Logger,
): Promise<DraftManifest> => {
  const draft = await findDraftByUuid(vaultPath, uuid, logger);
  if (!draft) {
    throw new DraftError("DRAFT_NOT_FOUND", `No draft with uuid ${uuid}.`, { uuid });
  }

  const directoryPath = draftDirectory(vaultPath, draft.directoryName);
  await rm(directoryPath, { recursive: true, force: true });
  logger?.info({ uuid, directoryName: draft.directoryName }, "draft deleted");
  return draft;
};
