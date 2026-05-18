import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { DraftManifest, Logger } from "@maskor/shared";
import { RESTORE_ASIDE_DIRNAME, STAGING_DIRNAME } from "./constants";
import { draftDirectory, draftsRoot } from "./paths";
import { readManifest } from "./manifest";

export type ListedDraft = DraftManifest & { directoryName: string };

const RESERVED_DIRECTORIES = new Set<string>([STAGING_DIRNAME, RESTORE_ASIDE_DIRNAME]);

export const listDrafts = async (
  vaultPath: string,
  logger?: Logger,
): Promise<ListedDraft[]> => {
  const root = draftsRoot(vaultPath);
  if (!existsSync(root)) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const drafts: ListedDraft[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (RESERVED_DIRECTORIES.has(entry.name)) continue;

    try {
      const manifest = await readManifest(draftDirectory(vaultPath, entry.name));
      drafts.push({ ...manifest, directoryName: entry.name });
    } catch (error) {
      logger?.warn(
        {
          directory: entry.name,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        "drafts: ignoring directory without a valid manifest",
      );
    }
  }

  drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return drafts;
};

export const findDraftByUuid = async (
  vaultPath: string,
  uuid: string,
  logger?: Logger,
): Promise<ListedDraft | undefined> => {
  const drafts = await listDrafts(vaultPath, logger);
  return drafts.find((draft) => draft.uuid === uuid);
};
