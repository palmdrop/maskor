import { defineConfig } from "orval";

// TODO: codegen requires the API to be running at localhost:3001. Run `bun run start` in packages/api first.

const capitalizeFirst = (string_: string) => string_.charAt(0).toUpperCase() + string_.slice(1);

export default defineConfig({
  maskor: {
    input: "http://localhost:3001/doc",
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
      },
    },
  },
});
