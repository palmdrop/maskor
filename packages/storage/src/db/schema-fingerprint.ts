import { Database } from "bun:sqlite";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// Opt-in dev escape hatch. When set, a DB whose schema fingerprint no longer matches the
// code's migration set is dropped and recreated clean on open, instead of forcing the
// developer to manually delete the DB + restart + reload after a schema change.
//
// Off by default: a normal/packaged run never resets. The reset discards DB-only state that
// `index.rebuild` cannot re-derive from the vault — `fragment_stats` behavioral telemetry,
// dismissed `UUID_COLLISION` warnings, and (for the registry DB) the project registry — so it
// must stay dev-only and opt-in. See references/plans/dev-db-auto-reset.md and
// specifications/storage-sync.md.
export const MASKOR_DB_AUTO_RESET_ENV = "MASKOR_DB_AUTO_RESET";

// PRAGMA user_version is a signed 32-bit integer; mask the hash into the positive 31-bit range.
const FINGERPRINT_MASK = 0x7fffffff;

const isAutoResetEnabled = (): boolean => {
  const value = process.env[MASKOR_DB_AUTO_RESET_ENV];
  return value === "1" || value?.toLowerCase() === "true";
};

const journalFilePath = (migrationsFolder: string): string =>
  join(migrationsFolder, "meta", "_journal.json");

// Rolling string hash, masked into the positive 31-bit range PRAGMA user_version allows.
const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash & FINGERPRINT_MASK;
};

interface JournalEntry {
  tag: string;
}

// Deterministic fingerprint of the migration set. The journal records each migration's tag and
// timestamp — enough to catch added, removed, or regenerated migrations, but NOT an in-place edit
// to an already-applied migration's SQL (its journal entry is unchanged). That amend case is one
// of the drift scenarios the reset must catch, so we fold in every migration's SQL body too: any
// add, remove, regenerate, or amend changes the fingerprint.
export const computeSchemaFingerprint = (migrationsFolder: string): number => {
  const journal = readFileSync(journalFilePath(migrationsFolder), "utf8");
  const entries = (JSON.parse(journal) as { entries?: JournalEntry[] }).entries ?? [];

  const migrationSql = entries
    .map((entry) => readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8"))
    .join("\n");

  return hashString(`${journal}\n${migrationSql}`);
};

// Read the stamped fingerprint, or null if the file can't be opened/read — a corrupt or
// half-written DB (e.g. a half-failed migration) is itself a drift signal, so the caller treats
// null as a mismatch and lets the reset heal it rather than crashing startup on open.
const readStoredFingerprint = (databaseFilePath: string): number | null => {
  try {
    const database = new Database(databaseFilePath, { readonly: true });
    try {
      const row = database.query("PRAGMA user_version").get() as { user_version: number } | null;
      return row?.user_version ?? 0;
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
};

// Delete a sqlite DB file plus its WAL/SHM sidecars, if present.
export const deleteDatabaseFiles = (databaseFilePath: string): void => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${databaseFilePath}${suffix}`, { force: true });
  }
};

// If auto-reset is enabled and the on-disk DB's schema fingerprint no longer matches the code's
// migration set, delete the DB files so the caller recreates them clean (a fresh migrate() then
// applies the full, current schema). Dev-only; returns true if a reset happened. Targets
// cross-restart drift: callers cache one DB connection per process (getVaultDatabase /
// getRegistryDatabase), so the fingerprint always matches on a same-process re-open and this is a
// no-op there. Because of that single-open-per-process guarantee there is never a live handle to
// tear down when this fires, so it deletes the files directly rather than going through
// closeRawVaultDatabase.
export const resetDatabaseIfSchemaDrifted = (
  databaseFilePath: string,
  migrationsFolder: string,
  label: string,
): boolean => {
  if (!isAutoResetEnabled()) return false;
  if (!existsSync(databaseFilePath)) return false;

  const current = computeSchemaFingerprint(migrationsFolder);
  const stored = readStoredFingerprint(databaseFilePath);
  if (stored === current) return false;

  // The registry holds the global project registry — not vault-derived, so a reset loses it until
  // projects re-register. The vault DB is repopulated by the startup rebuild.
  const consequence =
    label === "registry"
      ? "discarding the project registry; projects must be re-registered"
      : "discarding fragment_stats telemetry and dismissed UUID_COLLISION warnings; " +
        "re-derived from the vault on next rebuild";
  console.warn(
    `[maskor] ${MASKOR_DB_AUTO_RESET_ENV} is set and the ${label} DB schema fingerprint changed ` +
      `(${stored ?? "unreadable"} → ${current}). Resetting ${databaseFilePath} (${consequence}).`,
  );
  deleteDatabaseFiles(databaseFilePath);
  return true;
};

// Stamp the current schema fingerprint into the DB so a later run can detect drift. Call only
// after a successful migrate() on a freshly created DB — stamping an already-existing DB whose
// schema may be stale (amended migration never re-applied) would mask the very drift we detect.
export const stampSchemaFingerprint = (database: Database, migrationsFolder: string): void => {
  database.exec(`PRAGMA user_version = ${computeSchemaFingerprint(migrationsFolder)}`);
};
