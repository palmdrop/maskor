import { createStorageService } from "@maskor/storage";
import { createApp } from "./app";

const storageService = createStorageService();
const app = createApp(storageService);

const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Maskor API running on http://localhost:${port}`);
