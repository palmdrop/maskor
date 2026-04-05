import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/registry/schema.ts",
  out: "./src/db/registry/migrations",
  dialect: "sqlite",
});
