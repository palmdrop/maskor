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

// Deterministic fingerprint of the migration set. The journal lists every migration by tag and
// hash, so it changes whenever a migration is added, removed, or amended — exactly the cases
// where the live DB schema can drift from what the code expects.
export const computeSchemaFingerprint = (migrationsFolder: string): number => {
  const journal = readFileSync(journalFilePath(migrationsFolder), "utf8");
  let hash = 0;
  for (let index = 0; index < journal.length; index += 1) {
    hash = (hash * 31 + journal.charCodeAt(index)) | 0;
  }
  return hash & FINGERPRINT_MASK;
};

const readStoredFingerprint = (databaseFilePath: string): number => {
  const database = new Database(databaseFilePath, { readonly: true });
  try {
    const row = database.query("PRAGMA user_version").get() as { user_version: number } | null;
    return row?.user_version ?? 0;
  } finally {
    database.close();
  }
};

// Delete a sqlite DB file plus its WAL/SHM sidecars, if present.
const deleteDatabaseFiles = (databaseFilePath: string): void => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${databaseFilePath}${suffix}`, { force: true });
  }
};

// If auto-reset is enabled and the on-disk DB's schema fingerprint no longer matches the code's
// migration set, delete the DB files so the caller recreates them clean (a fresh migrate() then
// applies the full, current schema). Dev-only; returns true if a reset happened. Targets
// cross-restart drift: callers cache one DB connection per process, so the fingerprint always
// matches on a same-process re-open and this is a no-op there.
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

  const discarded =
    label === "registry"
      ? "the project registry"
      : "fragment_stats telemetry and dismissed UUID_COLLISION warnings";
  console.warn(
    `[maskor] ${MASKOR_DB_AUTO_RESET_ENV} is set and the ${label} DB schema fingerprint changed ` +
      `(${stored} → ${current}). Resetting ${databaseFilePath} (discarding ${discarded}); ` +
      `re-derived from the vault on next rebuild.`,
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
