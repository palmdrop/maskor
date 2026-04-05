import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import * as schema from "./schema";

export type RegistryDatabase = ReturnType<typeof createRegistryDatabase>;

export const DEFAULT_CONFIG_DIRECTORY =
  process.env["MASKOR_CONFIG_DIR"] ?? join(homedir(), ".config", "maskor");

export const createRegistryDatabase = (configDirectory: string) => {
  mkdirSync(configDirectory, { recursive: true });
  const database = new Database(join(configDirectory, "registry.db"));
  const registryDatabase = drizzle(database, { schema });
  migrate(registryDatabase, { migrationsFolder: join(import.meta.dir, "migrations") });
  return registryDatabase;
};
