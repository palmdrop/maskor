import { createStorageService } from "@maskor/storage";
import { createApp } from "./app";
import { createLogger } from "@maskor/shared/logger";

const logger = createLogger({ service: "api", level: process.env.LOG_LEVEL ?? "info" });
const storageService = createStorageService({ logger });
const app = createApp(storageService, logger);

const port = Number(process.env.MASKOR_API_PORT ?? 3001);

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});

logger.info({ port }, "Maskor API is running");
