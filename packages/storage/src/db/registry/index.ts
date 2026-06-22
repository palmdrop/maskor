import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import * as schema from "./schema";
import {
  classifySchemaState,
  resetDatabaseIfSchemaDrifted,
  stampSchemaFingerprint,
} from "../schema-fingerprint";

export type RegistryDatabase = ReturnType<typeof createRegistryDatabase>;

export const DEFAULT_CONFIG_DIRECTORY =
  process.env["MASKOR_CONFIG_DIR"] ?? join(homedir(), ".config", "maskor");

const migrationsFolder = join(import.meta.dir, "migrations");

export const createRegistryDatabase = (configDirectory: string) => {
  mkdirSync(configDirectory, { recursive: true });

  const databaseFilePath = join(configDirectory, "registry.db");
  // See createVaultDatabase: classify before any reset so a forward-only addition is applied in
  // place by migrate() while a genuine drift is reset, and so the state can drive re-stamping.
  const schemaState = classifySchemaState(databaseFilePath, migrationsFolder);
  resetDatabaseIfSchemaDrifted(databaseFilePath, migrationsFolder, "registry");
  const isFreshDatabase = !existsSync(databaseFilePath);

  const database = new Database(databaseFilePath);
  // Enforce FK constraints uniformly across every Maskor DB. The registry schema
  // has no foreign keys today, so this is a no-op now — but it future-proofs the
  // registry against the silent "cascades never fire" trap that bit the vault DB
  // (bun:sqlite defaults foreign_keys OFF). Mirrors createVaultDatabase.
  database.exec("PRAGMA foreign_keys = ON");
  const registryDatabase = drizzle(database, { schema });

  migrate(registryDatabase, { migrationsFolder });

  // Re-stamp whenever the DB now matches the current migration set (see createVaultDatabase). A
  // drift left in place (auto-reset off) is left unstamped to preserve drift detection.
  if (isFreshDatabase || schemaState === "match" || schemaState === "forward") {
    stampSchemaFingerprint(database, migrationsFolder);
  }

  return registryDatabase;
};
