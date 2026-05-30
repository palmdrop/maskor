import { defineConfig } from "orval";

// Reads a committed OpenAPI snapshot, so codegen needs no running API server.
// Regenerate the snapshot from packages/api with `bun run generate-openapi`
// whenever you add or change a route. See references/plans/offline-openapi-codegen.md.

const capitalizeFirst = (string_: string) => string_.charAt(0).toUpperCase() + string_.slice(1);

export default defineConfig({
  maskor: {
    input: "src/api/openapi.json",
    output: {
      mode: "tags-split",
      target: "src/api/generated",
      client: "react-query",
      override: {
        // Ensures generated type names start with uppercase while keeping function/hook names camelCase.
        operationName: (operation: unknown) =>
          capitalizeFirst(((operation as Record<string, unknown>).operationId as string) ?? ""),
        mutator: {
          path: "src/api/fetch.ts",
          name: "customFetch",
        },
        query: {
          signal: true,
        },
      },
    },
  },
});
