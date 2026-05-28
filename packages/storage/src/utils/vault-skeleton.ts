import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const VAULT_SKELETON_DIRS = [
  "fragments",
  join("fragments", "discarded"),
  "aspects",
  "notes",
  "references",
] as const;

// Idempotent — safe to call on startup to repair vaults missing skeleton dirs.
export const ensureVaultSkeleton = async (vaultPath: string): Promise<void> => {
  await Promise.all(
    VAULT_SKELETON_DIRS.map((dir) => mkdir(join(vaultPath, dir), { recursive: true })),
  );
};
