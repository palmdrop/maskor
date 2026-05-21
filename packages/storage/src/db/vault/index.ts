import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

export type VaultDatabase = ReturnType<typeof createVaultDatabase>;

// Side map keyed by vault.db file path → raw bun:sqlite Database. Lets the
// drafts module reach the underlying connection for `VACUUM INTO` without
// changing the shape of the drizzle wrapper that the rest of the storage
// service passes around.
const rawDatabaseByVaultPath = new Map<string, Database>();

const vaultDatabaseFilePath = (vaultRoot: string): string => join(vaultRoot, ".maskor", "vault.db");

export const createVaultDatabase = (vaultRoot: string) => {
  const maskorDirectory = join(vaultRoot, ".maskor");
  mkdirSync(maskorDirectory, { recursive: true });

  const databaseFilePath = vaultDatabaseFilePath(vaultRoot);
  const database = new Database(databaseFilePath);
  database.exec("PRAGMA foreign_keys = ON");
  const vaultDatabase = drizzle(database, { schema });

  migrate(vaultDatabase, { migrationsFolder: join(import.meta.dir, "migrations") });

  rawDatabaseByVaultPath.set(databaseFilePath, database);

  return vaultDatabase;
};

// Snapshot the vault database into a destination file using `VACUUM INTO`.
// The destination must not already exist. Uses the live raw connection so
// it respects any in-progress write transactions (caller is expected to
// have already drained writes via the watcher and any storage write lock).
export const vacuumVaultDatabaseInto = (vaultRoot: string, destinationPath: string): void => {
  const databaseFilePath = vaultDatabaseFilePath(vaultRoot);
  const raw = rawDatabaseByVaultPath.get(databaseFilePath);
  if (!raw) {
    throw new Error(`vacuumVaultDatabaseInto: no live database registered for vault ${vaultRoot}`);
  }
  raw.exec(`VACUUM INTO '${destinationPath.replace(/'/g, "''")}'`);
};

// Close the raw bun:sqlite handle for a vault and forget it. Used during
// draft restore: the live `vault.db` file is replaced on disk, so any open
// handle would still point at the deleted inode. The caller must drop any
// cached drizzle wrappers / indexer / watcher referencing this database
// — the next createVaultDatabase call opens a fresh connection.
export const closeRawVaultDatabase = (vaultRoot: string): void => {
  const databaseFilePath = vaultDatabaseFilePath(vaultRoot);
  const raw = rawDatabaseByVaultPath.get(databaseFilePath);
  if (!raw) return;
  raw.close();
  rawDatabaseByVaultPath.delete(databaseFilePath);
};
