import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import * as schema from "./schema";
import { resetDatabaseIfSchemaDrifted, stampSchemaFingerprint } from "../schema-fingerprint";

export type RegistryDatabase = ReturnType<typeof createRegistryDatabase>;

export const DEFAULT_CONFIG_DIRECTORY =
  process.env["MASKOR_CONFIG_DIR"] ?? join(homedir(), ".config", "maskor");

const migrationsFolder = join(import.meta.dir, "migrations");

export const createRegistryDatabase = (configDirectory: string) => {
  mkdirSync(configDirectory, { recursive: true });

  const databaseFilePath = join(configDirectory, "registry.db");
  resetDatabaseIfSchemaDrifted(databaseFilePath, migrationsFolder, "registry");
  // See createVaultDatabase: only a freshly created DB carries the full current schema, so only
  // a fresh DB is stamped. An existing DB stays unstamped to preserve drift detection.
  const isFreshDatabase = !existsSync(databaseFilePath);

  const database = new Database(databaseFilePath);
  // Enforce FK constraints uniformly across every Maskor DB. The registry schema
  // has no foreign keys today, so this is a no-op now — but it future-proofs the
  // registry against the silent "cascades never fire" trap that bit the vault DB
  // (bun:sqlite defaults foreign_keys OFF). Mirrors createVaultDatabase.
  database.exec("PRAGMA foreign_keys = ON");
  const registryDatabase = drizzle(database, { schema });

  migrate(registryDatabase, { migrationsFolder });

  if (isFreshDatabase) {
    stampSchemaFingerprint(database, migrationsFolder);
  }

  return registryDatabase;
};
