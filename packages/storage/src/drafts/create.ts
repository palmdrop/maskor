import { randomUUID } from "node:crypto";
import { mkdir, cp, rename, rm, rmdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { count } from "drizzle-orm";
import { slugify, type DraftManifest } from "@maskor/shared";
import type { Logger } from "@maskor/shared";
import {
  fragmentsTable,
  aspectsTable,
  notesTable,
  referencesTable,
  sequencesTable,
} from "../db/vault/schema";
import { vacuumVaultDatabaseInto, type VaultDatabase } from "../db/vault";
import {
  RESTORE_ASIDE_DIRNAME,
  SNAPSHOT_MASKOR_ENTRIES,
  SNAPSHOT_VAULT_DIRECTORIES,
  STAGING_DIRNAME,
} from "./constants";
import { DraftError } from "./errors";
import { writeManifest } from "./manifest";
import {
  buildDirectoryName,
  draftDirectory,
  draftsRoot,
  stagingDirectory,
  stagingRoot,
} from "./paths";
import { listDrafts } from "./list";
import { checkAvailableSpace } from "./disk-space";

export type CreateDraftInput = {
  vaultPath: string;
  vaultDatabase: VaultDatabase;
  name: string;
  note?: string;
  logger?: Logger;
};

export type CreateDraftResult = DraftManifest & { directoryName: string };

const ensureNameAvailable = async (vaultPath: string, name: string): Promise<void> => {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    throw new DraftError("DRAFT_INVALID_NAME", "Draft name cannot be empty.");
  }
  const existing = await listDrafts(vaultPath);
  if (existing.some((draft) => draft.name.trim().toLowerCase() === normalized)) {
    throw new DraftError(
      "DRAFT_NAME_CONFLICT",
      `A draft named "${name}" already exists in this project.`,
      { name },
    );
  }
};

const countEntities = (database: VaultDatabase) => {
  const fragmentsCount = database.select({ c: count() }).from(fragmentsTable).get();
  const aspectsCount = database.select({ c: count() }).from(aspectsTable).get();
  const notesCount = database.select({ c: count() }).from(notesTable).get();
  const referencesCount = database.select({ c: count() }).from(referencesTable).get();
  const sequencesCount = database.select({ c: count() }).from(sequencesTable).get();
  return {
    fragments: Number(fragmentsCount?.c ?? 0),
    aspects: Number(aspectsCount?.c ?? 0),
    notes: Number(notesCount?.c ?? 0),
    references: Number(referencesCount?.c ?? 0),
    sequences: Number(sequencesCount?.c ?? 0),
  };
};

const copyIfExists = async (sourcePath: string, destinationPath: string): Promise<void> => {
  if (!existsSync(sourcePath)) return;
  await cp(sourcePath, destinationPath, { recursive: true });
};

export const createDraft = async (input: CreateDraftInput): Promise<CreateDraftResult> => {
  const { vaultPath, vaultDatabase, name, note, logger } = input;

  await ensureNameAvailable(vaultPath, name);

  // Disk space pre-check before any file is written.
  const space = await checkAvailableSpace(vaultPath);
  if (!space.ok) {
    throw new DraftError(
      "INSUFFICIENT_DISK_SPACE",
      "Not enough free disk space to create a draft.",
      { required: space.required, available: space.available },
    );
  }

  const uuid = randomUUID();
  const directoryName = buildDirectoryName(slugify(name), uuid);
  const stagingPath = stagingDirectory(vaultPath, uuid);
  const draftPath = draftDirectory(vaultPath, directoryName);

  await mkdir(stagingPath, { recursive: true });

  try {
    // Copy top-level vault directories.
    for (const directory of SNAPSHOT_VAULT_DIRECTORIES) {
      await copyIfExists(join(vaultPath, directory), join(stagingPath, directory));
    }

    // Copy whitelisted entries from .maskor/. drafts/ is excluded (recursion).
    // vault.db is snapshotted separately via VACUUM INTO.
    const stagingMaskorDirectory = join(stagingPath, ".maskor");
    await mkdir(stagingMaskorDirectory, { recursive: true });
    for (const entry of SNAPSHOT_MASKOR_ENTRIES) {
      await copyIfExists(
        join(vaultPath, ".maskor", entry),
        join(stagingMaskorDirectory, entry),
      );
    }

    // VACUUM INTO requires the destination not to exist.
    const stagedDbPath = join(stagingMaskorDirectory, "vault.db");
    if (existsSync(stagedDbPath)) await rm(stagedDbPath, { force: true });
    vacuumVaultDatabaseInto(vaultPath, stagedDbPath);

    // Entity counts taken from the live DB — counts are stable because the
    // caller drains the watcher and holds the storage write lock before
    // invoking createDraft.
    const entityCounts = countEntities(vaultDatabase);

    const manifest: DraftManifest = {
      uuid,
      name: name.trim(),
      note: note?.trim() ? note.trim() : undefined,
      createdAt: new Date().toISOString(),
      entityCounts,
    };
    await writeManifest(stagingPath, manifest);

    // Atomic rename — the draft directory only becomes visible to listDrafts
    // after this succeeds, so a failure before this point leaves no partial
    // draft on disk.
    await mkdir(draftsRoot(vaultPath), { recursive: true });
    await rename(stagingPath, draftPath);

    // Best-effort cleanup of the now-empty staging parent. Failure here
    // doesn't break the draft — leftover empty directories are also handled
    // by cleanupStaleDirectories on next resolve.
    try {
      await rmdir(stagingRoot(vaultPath));
    } catch {
      // ignore — staging parent might be non-empty if another concurrent
      // operation is staging (the mutex blocks this for the same vault, but
      // the rmdir failing here is harmless either way).
    }

    logger?.info({ uuid, name, directoryName }, "draft created");
    return { ...manifest, directoryName };
  } catch (error) {
    // Best-effort staging cleanup. Swallow ENOENT so the original error
    // bubbles up unobscured.
    try {
      await rm(stagingPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw error;
  }
};

// Re-export the on-disk reserved folder names for tests that need to assert
// against them.
export const RESERVED_DIRECTORY_NAMES = [STAGING_DIRNAME, RESTORE_ASIDE_DIRNAME] as const;
