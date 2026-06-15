// Generates the OpenAPI document snapshot consumed by the frontend's orval
// codegen, so `bun run codegen` needs no running API server.
//
// The document is produced in-process: createApp() returns the OpenAPIHono
// instance and getOpenAPIDocument() walks the registered route definitions.
// Handlers never run, so the injected storageService is never touched — a bare
// cast is safe and the script hits no filesystem/database state. See
// references/plans/offline-openapi-codegen.md.
//
// Must run under bun (transitive bun:sqlite etc.). Mirrors the live `/doc`
// endpoint exactly by using getOpenAPIDocument (OpenApiGeneratorV3) with the
// shared OPENAPI_DOCUMENT_CONFIG.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { StorageService } from "@maskor/storage";
import { createApp } from "../app";
import { OPENAPI_DOCUMENT_CONFIG } from "../openapi-config";

export const SNAPSHOT_PATH = fileURLToPath(
  new URL("../../../frontend/src/api/openapi.json", import.meta.url),
);

// Guards against a route declared with Hono `:param` syntax instead of the
// OpenAPI `{param}` template. `:param` parses fine for routing but lands
// literally in the OpenAPI document, so orval builds a client that requests
// `/visit/:fragmentId` verbatim — a silent break. The snapshot compares equal to
// the routes, so `verify:openapi` alone wouldn't catch it; this assertion does.
// (fragment-visit + fragment-pick both hit this historically.)
export const assertOpenAPIPathsUseBraces = (paths: Record<string, unknown>): void => {
  const offending = Object.keys(paths).filter((pathKey) =>
    pathKey.split("/").some((segment) => segment.startsWith(":")),
  );

  if (offending.length > 0) {
    throw new Error(
      "OpenAPI path(s) use ':param' syntax instead of '{param}', which orval emits as a " +
        `literal URL segment:\n${offending.map((pathKey) => `  ${pathKey}`).join("\n")}\n` +
        'Fix the route definition to use `path: "/.../{param}"`.',
    );
  }
};

// Renders the snapshot file contents exactly as written to disk: pretty-printed
// JSON with a trailing newline (matches prettier). Pure — no filesystem access —
// so the verify guard can compare against the committed file without a temp file.
export const renderOpenAPISnapshot = (): string => {
  const app = createApp({} as StorageService);
  const document = app.getOpenAPIDocument(OPENAPI_DOCUMENT_CONFIG);

  assertOpenAPIPathsUseBraces(document.paths ?? {});

  return `${JSON.stringify(document, null, 2)}\n`;
};

const writeSnapshot = async (): Promise<void> => {
  const outputPath = process.argv[2] ?? SNAPSHOT_PATH;

  await writeFile(outputPath, renderOpenAPISnapshot(), "utf-8");
};

// Only write when run directly (`bun run generate-openapi`). Importing this
// module from the verify guard must not have filesystem side effects.
if (import.meta.main) {
  await writeSnapshot();
}
