export const MASKOR_DIRNAME = ".maskor";
export const DRAFTS_DIRNAME = "drafts";
export const STAGING_DIRNAME = ".staging";
export const RESTORE_ASIDE_DIRNAME = ".restore-aside";
export const MANIFEST_FILENAME = "manifest.json";

// Top-level vault directories included in a draft snapshot (relative to vault root).
export const SNAPSHOT_VAULT_DIRECTORIES = [
  "fragments",
  "aspects",
  "notes",
  "references",
  "pieces",
] as const;

// Items inside .maskor/ that are snapshotted (everything except drafts/, vault.db, and
// the Obsidian editor state). vault.db is snapshotted separately via VACUUM INTO.
export const SNAPSHOT_MASKOR_ENTRIES = ["sequences", "config", "project.json", "action-log.jsonl"] as const;

// Live vault entries that are renamed-aside and replaced during restore.
// project.json and action-log.jsonl are deliberately excluded — they belong
// to the user's current working environment, not the snapshotted moment.
export const RESTORE_VAULT_DIRECTORIES = [
  "fragments",
  "aspects",
  "notes",
  "references",
  "pieces",
] as const;

export const RESTORE_MASKOR_ENTRIES = ["sequences", "config", "vault.db"] as const;
