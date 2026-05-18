import { join } from "node:path";
import {
  DRAFTS_DIRNAME,
  MANIFEST_FILENAME,
  MASKOR_DIRNAME,
  RESTORE_ASIDE_DIRNAME,
  STAGING_DIRNAME,
} from "./constants";

export const draftsRoot = (vaultPath: string): string =>
  join(vaultPath, MASKOR_DIRNAME, DRAFTS_DIRNAME);

export const stagingRoot = (vaultPath: string): string =>
  join(draftsRoot(vaultPath), STAGING_DIRNAME);

export const restoreAsideRoot = (vaultPath: string): string =>
  join(draftsRoot(vaultPath), RESTORE_ASIDE_DIRNAME);

export const stagingDirectory = (vaultPath: string, uuid: string): string =>
  join(stagingRoot(vaultPath), uuid);

export const draftDirectory = (vaultPath: string, directoryName: string): string =>
  join(draftsRoot(vaultPath), directoryName);

export const manifestPath = (draftDirectoryPath: string): string =>
  join(draftDirectoryPath, MANIFEST_FILENAME);

// Folder name = "<slug>-<short-uuid>" per spec § Draft storage layout.
export const buildDirectoryName = (slug: string, uuid: string): string => {
  const shortUuid = uuid.replace(/-/g, "").slice(0, 8);
  return slug ? `${slug}-${shortUuid}` : shortUuid;
};
