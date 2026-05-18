import { readdir, stat, statfs } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { DRAFTS_DIRNAME, MASKOR_DIRNAME } from "./constants";

// Recursive size walker. Skips the drafts directory so existing snapshots
// do not inflate the pre-check.
const directorySize = async (root: string, skipDrafts: boolean): Promise<number> => {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = (await readdir(root, { withFileTypes: true })) as Dirent[];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  for (const entry of entries) {
    if (
      skipDrafts &&
      entry.isDirectory() &&
      root.endsWith(MASKOR_DIRNAME) &&
      entry.name === DRAFTS_DIRNAME
    ) {
      continue;
    }
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(fullPath, skipDrafts);
    } else if (entry.isFile()) {
      const info = await stat(fullPath);
      total += info.size;
    }
  }
  return total;
};

export type DiskSpaceCheck = {
  ok: boolean;
  required: number;
  available: number;
  vaultSize: number;
};

// Spec § Creating a draft step 1: available disk space must be at least
// 2 × (vaultSize + dbSize). The DB size is included in the directory walk
// (vault.db lives under .maskor/), so this returns required = 2 * vaultSize.
export const checkAvailableSpace = async (vaultPath: string): Promise<DiskSpaceCheck> => {
  const vaultSize = await directorySize(vaultPath, true);
  const required = vaultSize * 2;
  const stats = await statfs(vaultPath);
  const available = Number(stats.bsize) * Number(stats.bavail);
  return { ok: available >= required, required, available, vaultSize };
};
