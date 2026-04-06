import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStorageService } from "@maskor/storage";
import { createApp } from "../../app";
import type { Hono } from "hono";
import type { AppVariables } from "../../app";

type TestApp = {
  app: Hono<{ Variables: AppVariables }>;
  storageService: ReturnType<typeof createStorageService>;
  temporaryDirectory: string;
  cleanup: () => void;
};

export const createTestApp = (): TestApp => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "maskor-api-test-"));
  const configDirectory = join(temporaryDirectory, "config");

  const storageService = createStorageService({ configDirectory });
  const app = createApp(storageService);

  const cleanup = () => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  };

  return { app, storageService, temporaryDirectory, cleanup };
};
