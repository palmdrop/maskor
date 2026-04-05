import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

export type VaultDatabase = ReturnType<typeof createVaultDatabase>;

export const createVaultDatabase = (vaultRoot: string) => {
  const maskorDirectory = join(vaultRoot, ".maskor");
  mkdirSync(maskorDirectory, { recursive: true });

  const database = new Database(join(maskorDirectory, "vault.db"));
  const vaultDatabase = drizzle(database, { schema });

  migrate(vaultDatabase, { migrationsFolder: join(import.meta.dir, "migrations") });

  return vaultDatabase;
};
