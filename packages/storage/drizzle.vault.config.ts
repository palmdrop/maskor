import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/vault-db/schema.ts",
  out: "./src/db/vault-db/migrations",
  dialect: "sqlite",
});
