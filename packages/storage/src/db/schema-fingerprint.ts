import { Database } from "bun:sqlite";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// Opt-in dev escape hatch. When set, a DB whose schema has genuinely drifted from the code's
// migration set (an amended/removed migration, or a corrupt file — NOT a forward-only addition,
// which migrate() applies in place) is dropped and recreated clean on open, instead of forcing the
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

// The migration tags in journal (apply) order.
const readMigrationTags = (migrationsFolder: string): string[] => {
  const journal = readFileSync(journalFilePath(migrationsFolder), "utf8");
  const entries = (JSON.parse(journal) as { entries?: JournalEntry[] }).entries ?? [];
  return entries.map((entry) => entry.tag);
};

// Fingerprint of the first `count` migrations, folding each migration's tag + SQL body in apply
// order. Folding per-migration (rather than hashing the whole journal blob) makes the fingerprint
// *prefix-stable*: the fingerprint of a migration set equals the fingerprint of its first-N
// migrations. So a set that only had migrations appended shares the earlier set's prefix
// fingerprint — which is what lets `classifySchemaState` tell a forward-only addition (migrate()
// reconciles it, data preserved) apart from an in-place amend/removal (genuine drift).
const fingerprintForCount = (migrationsFolder: string, count: number): number => {
  const tags = readMigrationTags(migrationsFolder).slice(0, count);
  const payload = tags
    .map((tag) => `${tag}\n${readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8")}`)
    .join("\n--\n");
  return hashString(payload);
};

// Deterministic fingerprint of the full migration set. Any add, remove, regenerate, or in-place
// amend changes it: tags capture add/remove; folding each SQL body captures an amend (whose
// journal entry is otherwise unchanged).
export const computeSchemaFingerprint = (migrationsFolder: string): number =>
  fingerprintForCount(migrationsFolder, readMigrationTags(migrationsFolder).length);

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

// How the on-disk DB's stamped schema fingerprint relates to the code's current migration set:
//   "absent"  — no DB file yet (a fresh create).
//   "match"   — the stamp equals the current set; nothing to do.
//   "forward" — the stamp equals a *proper prefix* of the current set: the set only had migrations
//               appended, so migrate() applies them in place and the existing data is preserved.
//   "drift"   — anything else (an amended/removed migration, an unrelated/older stamp, or an
//               unreadable/corrupt file): migrate() cannot reconcile it, so a reset is warranted.
export type SchemaState = "absent" | "match" | "forward" | "drift";

export const classifySchemaState = (
  databaseFilePath: string,
  migrationsFolder: string,
): SchemaState => {
  if (!existsSync(databaseFilePath)) return "absent";

  const stored = readStoredFingerprint(databaseFilePath);
  if (stored === null) return "drift";

  const current = computeSchemaFingerprint(migrationsFolder);
  if (stored === current) return "match";

  // Forward-only addition: the stamp matches some shorter prefix of the current set.
  const total = readMigrationTags(migrationsFolder).length;
  for (let count = 1; count < total; count += 1) {
    if (fingerprintForCount(migrationsFolder, count) === stored) return "forward";
  }
  return "drift";
};

// If auto-reset is enabled and the on-disk DB has genuinely drifted — an amended or removed
// migration, or a corrupt file, as opposed to a forward-only addition migrate() can apply — delete
// the DB files so the caller recreates them clean (a fresh migrate() then applies the full, current
// schema). Dev-only; returns true if a reset happened. Targets cross-restart drift: callers cache
// one DB connection per process (getVaultDatabase / getRegistryDatabase), so a same-process re-open
// is always "match" and this is a no-op there. Because of that single-open-per-process guarantee
// there is never a live handle to tear down when this fires, so it deletes the files directly rather
// than going through closeRawVaultDatabase.
export const resetDatabaseIfSchemaDrifted = (
  databaseFilePath: string,
  migrationsFolder: string,
  label: string,
): boolean => {
  if (!isAutoResetEnabled()) return false;
  if (classifySchemaState(databaseFilePath, migrationsFolder) !== "drift") return false;

  // The registry holds the global project registry — not vault-derived, so a reset loses it until
  // projects re-register. The vault DB is repopulated by the startup rebuild.
  const consequence =
    label === "registry"
      ? "discarding the project registry; projects must be re-registered"
      : "discarding fragment_stats telemetry and dismissed UUID_COLLISION warnings; " +
        "re-derived from the vault on next rebuild";
  console.warn(
    `[maskor] ${MASKOR_DB_AUTO_RESET_ENV} is set and the ${label} DB schema has drifted ` +
      `(an amended/removed migration or a corrupt file). Resetting ${databaseFilePath} ` +
      `(${consequence}).`,
  );
  deleteDatabaseFiles(databaseFilePath);
  return true;
};

// Stamp the current schema fingerprint into the DB so a later run can detect drift. Safe to call
// after a successful migrate() whenever the DB now corresponds to the current migration set: a
// fresh / just-reset DB (migrate() built the full schema), an already-current DB, or a forward DB
// whose appended migrations migrate() just applied. Must NOT be called for a drift left in place
// (auto-reset off): the schema is stale, so re-stamping would mask the very drift we detect.
export const stampSchemaFingerprint = (database: Database, migrationsFolder: string): void => {
  database.exec(`PRAGMA user_version = ${computeSchemaFingerprint(migrationsFolder)}`);
};
