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
import type { StorageService } from "@maskor/storage";
import { createApp } from "../app";
import { OPENAPI_DOCUMENT_CONFIG } from "../openapi-config";

const DEFAULT_OUTPUT_PATH = new URL("../../../frontend/src/api/openapi.json", import.meta.url)
  .pathname;

const generateOpenAPIDocument = (): unknown => {
  const app = createApp({} as StorageService);
  return app.getOpenAPIDocument(OPENAPI_DOCUMENT_CONFIG);
};

const main = async (): Promise<void> => {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT_PATH;
  const document = generateOpenAPIDocument();
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf-8");
};

await main();
