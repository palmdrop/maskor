import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import type { AppVariables } from "../app";

// Not in OpenAPI spec — SSE streaming is incompatible with the standard JSON response contract.
export const eventsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

eventsRouter.get("/", (ctx) => {
  const storageService = ctx.get("storageService");
  const projectContext = ctx.get("projectContext");

  // projectContext is always set here — resolveProject middleware returns 404 before this
  // handler runs if the project is missing. Guard kept for type safety.
  if (!projectContext) {
    return ctx.json({ error: "PROJECT_NOT_FOUND" }, 404);
  }

  return streamSSE(ctx, async (stream) => {
    const unsubscribe = storageService.watcher.subscribe(projectContext, (event) => {
      // Fire-and-forget: streamSSE callbacks are sync, writeSSE returns a Promise.
      // Errors here are non-fatal — the client will reconnect via EventSource.
      stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => {});
    });

    // Register abort cleanup after subscribe — unsubscribe is defined by this point.
    stream.onAbort(() => {
      unsubscribe();
    });

    // Guard: abort may have fired in the window between subscribe() and onAbort() above.
    // No await occurs in that window (JS is single-threaded), so this is a belt-and-braces
    // check rather than a true race, but it keeps the contract explicit.
    if (stream.aborted) {
      unsubscribe();
      return;
    }

    // Keep-alive: check both stream.closed and stream.aborted —
    // stream.sleep() does not resolve early on disconnect, and abort sets
    // stream.aborted, not stream.closed.
    while (!stream.closed && !stream.aborted) {
      await stream.sleep(30_000);
      if (!stream.closed && !stream.aborted) {
        // SSEMessage has no comment field — send an empty data event as keep-alive.
        await stream.writeSSE({ data: "" }).catch(() => {});
      }
    }
  });
});
