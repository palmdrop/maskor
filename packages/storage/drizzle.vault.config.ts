import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/vault/schema.ts",
  out: "./src/db/vault/migrations",
  dialect: "sqlite",
});
