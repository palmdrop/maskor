import type { OpenAPIHono } from "@hono/zod-openapi";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStorageService } from "@maskor/storage";
import { createApp, type AppVariables } from "../../app";

type TestApp = {
  app: OpenAPIHono<{ Variables: AppVariables }>;
  storageService: ReturnType<typeof createStorageService>;
  temporaryDirectory: string;
  cleanup: () => Promise<void>;
};

export const createTestApp = (): TestApp => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "maskor-api-test-"));
  const configDirectory = join(temporaryDirectory, "config");

  const storageService = createStorageService({ configDirectory });
  const app = createApp(storageService, undefined, configDirectory);

  // Stop watchers before deleting the temp vault: a live watcher fires deferred
  // DB writes against the removed directory (Linux: "readonly database"), which
  // poisons later test files. See storageService.shutdown() / the OS note in
  // watcher/sync/keyed-entity.ts. Callers must `await` this in their teardown.
  const cleanup = async () => {
    await storageService.shutdown();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  };

  return { app, storageService, temporaryDirectory, cleanup };
};
