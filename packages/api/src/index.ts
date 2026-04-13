import { createStorageService } from "@maskor/storage";
import { createApp } from "./app";
import { createLogger } from "@maskor/shared";

const logger = createLogger({ service: "api" });
const storageService = createStorageService({ logger });
const app = createApp(storageService, logger);

const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  fetch: app.fetch,
});

logger.info({ port }, "Maskor API is running");
