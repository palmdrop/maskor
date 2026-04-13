# SSE Vault Change Events

**Date**: 13-04-2026
**Status**: Done
**Implemented At**: 13-04-2026

## Goal

Push vault change notifications from the watcher to the frontend so React Query can
invalidate and refetch. No incremental diff — just a typed signal that something changed.

## Why SSE, not WebSockets

- Use case is one-directional (server → client only).
- Hono has native `streamSSE` — minimal boilerplate.
- SSE is plain HTTP: works behind any reverse proxy (nginx `proxy_buffering off`), works
  inside Tauri webviews unchanged, works in Docker without special config.
- `EventSource` auto-reconnects on disconnect — handles sidecar restarts transparently.
- If bidirectional control is later needed (e.g. trigger rebuild from frontend), use a
  regular POST — cleaner than overloading a socket for it.

## Orval and the SSE endpoint

Orval only generates from the OpenAPI spec. The `/events` route is a plain `.get()` —
intentionally outside the spec — so orval produces nothing for it. `useVaultEvents` is a
handwritten hook and lives in `src/hooks/` alongside the generated code, not inside
`src/api/generated/`.

---

## Step 1 — `VaultSyncEvent` in `packages/shared`

`VaultSyncEvent` must live in `packages/shared` (not `packages/storage`) so the frontend
can import it without depending on the storage package.

Also export `VAULT_SYNC_EVENT_TYPES` — a const array validated against the union at compile
time. If a new variant is added to the union but not the array, TypeScript errors. This is
the single source of truth for the event type list; no manual duplication anywhere.

```ts
// packages/shared/src/events.ts

export type VaultSyncEvent =
  | { type: "fragment:synced"; uuid: string }
  | { type: "fragment:deleted"; filePath: string }
  | { type: "aspect:synced"; uuid: string }
  | { type: "aspect:deleted"; filePath: string }
  | { type: "note:synced"; uuid: string }
  | { type: "note:deleted"; filePath: string }
  | { type: "reference:synced"; uuid: string }
  | { type: "reference:deleted"; filePath: string }
  | { type: "pieces:consumed"; count: number };

export const VAULT_SYNC_EVENT_TYPES = [
  "fragment:synced",
  "fragment:deleted",
  "aspect:synced",
  "aspect:deleted",
  "note:synced",
  "note:deleted",
  "reference:synced",
  "reference:deleted",
  "pieces:consumed",
] as const satisfies VaultSyncEvent["type"][];
```

Export both from `packages/shared/src/index.ts`.

---

## Step 2 — Subscriber set on `VaultWatcher` (`packages/storage/src/watcher/watcher.ts`)

Import `VaultSyncEvent` from `@maskor/shared`. Add `subscribe` to the `VaultWatcher` type
and implement it inside `createVaultWatcher`.

```ts
import type { VaultSyncEvent } from "@maskor/shared";

export type VaultWatcher = {
  start(): void;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  // Returns an unsubscribe function.
  subscribe(callback: (event: VaultSyncEvent) => void): () => void;
};
```

Inside `createVaultWatcher`:

- Add `const subscribers = new Set<(event: VaultSyncEvent) => void>()`.
- Implement `subscribe(callback)` — adds to set, returns `() => subscribers.delete(callback)`.
- Add a private `emit(event: VaultSyncEvent)` that fans out to all subscribers.
- Call `emit(...)` **after the transaction block returns**, not inside the transaction callback.
  Placing emit inside the callback is conceptually wrong even though SQLite transactions are
  currently synchronous — it would fire the event before the write is visible to readers.
  - `syncFragment` → `emit({ type: "fragment:synced", uuid })` — after `vaultDatabase.transaction(...)`
  - `syncAspect` → `emit({ type: "aspect:synced", uuid })` — after `vaultDatabase.transaction(...)`
  - `syncNote` → `emit({ type: "note:synced", uuid })` — after `vaultDatabase.transaction(...)`
  - `syncReference` → `emit({ type: "reference:synced", uuid })` — after `vaultDatabase.transaction(...)`
  - `syncPieces` → `emit({ type: "pieces:consumed", count: fragments.length })` — after the transaction
  - `handleUnlink` — emit the appropriate `<entity>:deleted` event after each branch's transaction call

---

## Step 3 — Expose subscription on `StorageService` (`packages/storage/src/service/storage-service.ts`)

Add to the `watcher` namespace:

```ts
subscribe(context: ProjectContext, callback: (event: VaultSyncEvent) => void): () => void {
  return getVaultWatcher(context).subscribe(callback);
},
```

---

## Step 4 — SSE route (`packages/api/src/routes/events.ts`)

Use Hono's `streamSSE` from `hono/streaming`. This is a plain `.get()`, not a `createRoute` —
SSE streaming does not fit the OpenAPI JSON request/response contract, so it intentionally
stays outside the spec. Add a comment noting this.

**Keep-alive loop:** `stream.sleep()` does not resolve early on client disconnect. `stream.abort()`
sets `stream.aborted = true`, not `stream.closed` — so the loop condition must check both.
Without this, a disconnected client's subscription leaks and the loop runs forever.

**Keep-alive message:** `SSEMessage` in Hono does not have a `comment` field — `writeSSE({ comment: "ping" })`
won't compile. Use `writeSSE({ data: "" })` with no `event` field as the keep-alive signal instead.

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import type { AppVariables } from "../app";

export const eventsRouter = new OpenAPIHono<{ Variables: AppVariables }>();

// Not in OpenAPI spec — SSE streaming is incompatible with the standard JSON response contract.
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

    stream.onAbort(() => {
      unsubscribe();
    });

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
```

---

## Step 5 — Mount in `app.ts`

```ts
import { eventsRouter } from "./routes/events";

// inside createApp:
projectScopedApp.route("/events", eventsRouter);
```

Full path: `GET /projects/:projectId/events`.

---

## Step 6 — Frontend hook (`packages/frontend/src/hooks/useVaultEvents.ts`)

Import `VAULT_SYNC_EVENT_TYPES` from `@maskor/shared`. The event type list is derived from
the shared package — no manual array in the hook.

**Query key:** `invalidateQueries({ queryKey: [projectId] })` only works if orval-generated
keys start with `projectId` as the first element. Verify the actual shape of
`getListFragmentsQueryKey(projectId)` (and equivalent keys for aspects/notes/references)
before assuming broad invalidation hits anything. If the key structure doesn't match, this
is a silent no-op, not an error.

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { VAULT_SYNC_EVENT_TYPES } from "@maskor/shared";

export const useVaultEvents = (projectId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource(`http://localhost:3001/projects/${projectId}/events`);

    const handleEvent = () => {
      // Broad invalidation — refetches all data for this project.
      // Verify this prefix matches the actual orval-generated query key structure.
      // Can be narrowed per event.type later if needed.
      queryClient.invalidateQueries({ queryKey: [projectId] });
    };

    for (const type of VAULT_SYNC_EVENT_TYPES) {
      source.addEventListener(type, handleEvent);
    }

    return () => {
      source.close();
    };
  }, [projectId, queryClient]);
};
```

Call `useVaultEvents(projectId)` in `ProjectShellPage`.

---

## Step 7 — Wire up the watcher start

The watcher must be running for events to flow. A concrete decision is needed on where
`storageService.watcher.start(context)` is called — "verify it's somewhere" is not enough.

**Recommended:** call it in the `resolveProject` middleware after setting `projectContext`.
This ensures the watcher is always running for any project that receives a request, including
the SSE connection. The downside is a side effect in middleware — document it clearly.

Alternatively, call it explicitly in both `POST /projects` (on create) and
`GET /projects/:projectId` (on first load). More explicit, but requires two call sites.

---

## Step 8 — Rebuild on startup

The frontend currently triggers a full index rebuild on every project load (`ProjectShellPage`).
This is a stopgap and somewhat brittle — a rebuild triggered from the client is an odd pattern.

The watcher uses `ignoreInitial: true`, so it only catches changes _after_ it starts. A vault
edited while the API was down will not be indexed until the next file change triggers the watcher.
This means the rebuild-on-load cannot safely be removed until startup rebuild is handled server-side.

**Recommended path:**

- Move rebuild to the API startup sequence: call `storageService.index.rebuild(context)` when
  a project's watcher is first started (e.g. alongside `watcher.start(context)` in Step 7).
- Once server-side startup rebuild is in place, remove the frontend-triggered rebuild.
- Until then, keep the frontend rebuild but acknowledge it's a temporary pattern.

---

## Testing notes

- Use `app.request()` to test the route returns `Content-Type: text/event-stream`.
- For integration: trigger a file change on a test vault, assert the subscriber callback fires.
- Frontend hook can be tested with a mock `EventSource` stub once MSW is added (see suggestions).

---

## Port / base URL note

`useVaultEvents` hardcodes `http://localhost:3001`. This is the same convention as the orval
config. When a shared config is introduced (see suggestions: port/environment config), update both.
