import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const VAULT_SKELETON_DIRS = [
  "fragments",
  join("fragments", "discarded"),
  "aspects",
  "notes",
  "references",
  // Maskor-owned dirs. Created eagerly so adopting a vault that lacks them does not error when
  // the indexer lists sequences/config on the first rebuild. The watcher ignores .maskor/ entirely.
  join(".maskor", "sequences"),
  join(".maskor", "config"),
] as const;

// Idempotent — safe to call on startup to repair vaults missing skeleton dirs.
export const ensureVaultSkeleton = async (vaultPath: string): Promise<void> => {
  await Promise.all(
    VAULT_SKELETON_DIRS.map((dir) => mkdir(join(vaultPath, dir), { recursive: true })),
  );
};
