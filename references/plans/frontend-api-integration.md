# Frontend API Integration — First End-to-End Flow

**Date**: 07-04-2026
**Status**: Done
**Implemented At**: 08-04-2026

---

## Goal

Wire Obsidian vault → StorageService → Hono API → React frontend for the first time. No polish. The deliverable is a working data flow: project list → project selection → index rebuild → fragment list → fragment detail.

---

## Architectural Decisions

### 1. API Client — orval codegen → typed TanStack Query hooks

**Decision**: Use `orval` to generate typed TanStack Query hooks directly from the OpenAPI spec served at `GET /doc`.

**Codegen command** (API must be running):

```bash
bunx orval --config orval.config.ts
```

Output: `packages/frontend/src/api/generated/` — one file per tag (Fragments, Projects, etc.), each exporting typed hooks and the underlying fetch functions.

**Why orval over alternatives** (evaluated April 2026):

| Tool                                     | TQ v5                  | Output                                                        | Maintenance                            |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------- | -------------------------------------- |
| **orval** (chosen)                       | Yes — v8.6.2, Mar 2025 | Full hooks, direct use                                        | Active                                 |
| hey-api/openapi-ts                       | Yes — first-class      | `queryOptions()` functions, not hooks; manual wiring per call | Very active but rapid breaking changes |
| Kubb                                     | Yes — v5-only since v3 | Full hooks                                                    | Active, verbose config                 |
| openapi-typescript + openapi-react-query | Partial                | Thin wrappers, manual per call site                           | Active                                 |
| hono/client (RPC)                        | —                      | **Incompatible** with `@hono/zod-openapi` routes              | —                                      |

- `hey-api/openapi-ts` generates `queryOptions()` composition functions rather than ready-to-use hooks — contradicts the "zero manual typings" goal, and had a breaking restructure in v0.95.0 (April 2025).
- Orval's custom fetch mutator pattern (used in this plan) neutralises the main orval footgun (response handling buried in internals).
- Orval also supports MSW + Faker mock generation as an add-on — useful once integration tests are added.

**Prerequisite — add `operationId` to all routes before codegen**: Without explicit `operationId` fields, orval derives hook names from method + path, producing `useGetProjectsProjectIdFragments`. This must be done before the first codegen run. Example:

```ts
createRoute({
  operationId: "listFragments",
  method: "get",
  path: "/projects/{projectId}/fragments",
  // ...
});
```

**Codegen setup**:

- `orval.config.ts` at `packages/frontend/` root
- Targets `http://localhost:3001/doc` (live spec) or a saved snapshot `src/api/openapi.json` (for offline / CI)
- Output mode: `tags-split` — one file per OpenAPI tag
- Client: `react-query` (generates TanStack Query v5 hooks)
- Add `"codegen": "bunx orval --config orval.config.ts"` to `packages/frontend/package.json` scripts

**Regeneration**: run `bun run codegen` after any API route change. Commit the generated files (keeps CI independent of a running API server).

**Naming**: orval generates hooks named after the operationId. The `@hono/zod-openapi` `createRoute()` calls do not set `operationId` explicitly — orval will derive names from method + path (e.g. `useGetProjectsProjectIdFragments`). Verbose but fine.

**Note on `operationId`**: Adding `operationId` to routes is a prerequisite (see above), not a deferred step. It must be done before the first codegen run.

---

### 2. State Management — TanStack Query only, no global store

**Decision**: TanStack Query (`@tanstack/react-query`). Orval generates hooks that use it directly — no additional wiring needed beyond wrapping the app in `QueryClientProvider`.

**Selected configuration**:

- `staleTime: 0` — always refetch after rebuild
- `retry: 1` — local API, failures are real

**What is deferred**: Zustand/Jotai for editor state (cursor, unsaved edits, local sequencer reordering) — not needed until the editor view is built.

---

### 3. Routing — TanStack Router, file-based, minimal setup now

**Decision**: TanStack Router. Two routes for this plan:

```
/                          — ProjectSelectionPage
/projects/$projectId       — ProjectShellPage (fragment list + detail panel)
```

**Why not React Router**: TanStack Router has first-class typed route params. UUID params flow through without casting. Retrofitting routing later is worse than installing it now.

---

### 4. Project Selection UX

- **Zero projects**: static message — "No projects registered. Use the API to register one." No registration form (requires file picker — deferred to Tauri integration).
- **One project**: auto-redirect to `/projects/$projectId` on load.
- **Multiple projects**: flat list, click to navigate.

---

### 5. CORS / Dev Setup — Vite proxy

Vite proxies `/api/*` → `http://localhost:3001`. The generated orval client uses `/api` as base URL. No hardcoded ports in component code, no CORS issues in dev.

Under Tauri: proxy goes away, base URL becomes `http://localhost:3001` directly via an env var (`VITE_API_BASE_URL`). Nothing else changes.

---

### 6. Tauri vs Browser

Plain browser only for this plan. No incompatibilities with Tauri — only the API base URL changes.

---

## What Is Deferred and Why

| Item                          | Reason                                                   |
| ----------------------------- | -------------------------------------------------------- |
| Saved OpenAPI snapshot for CI | Start with live spec; add snapshot once CI is configured |
| Project registration form     | Needs file picker; wait for Tauri                        |
| Fragment creation UI          | Read-only flow demo                                      |
| Pool filter UI                | API supports it; not needed for demo                     |
| Error boundaries / toasts     | After happy path works                                   |
| Zustand / Jotai               | No cross-component state yet                             |
| MSW for tests                 | Blocked on having fetch calls to mock                    |

---

## File-by-File Change List

### `packages/frontend/package.json`

Add dependencies:

```
@tanstack/react-query
@tanstack/react-router
```

Add devDependencies:

```
orval
```

Add script:

```json
"codegen": "bunx orval --config orval.config.ts"
```

### `packages/frontend/orval.config.ts` — NEW

```ts
import { defineConfig } from "orval";

export default defineConfig({
  maskor: {
    input: "http://localhost:3001/doc",
    output: {
      mode: "tags-split",
      target: "src/api/generated",
      client: "react-query",
      override: {
        mutator: {
          path: "src/api/fetch.ts",
          name: "customFetch",
        },
      },
    },
  },
});
```

### `packages/frontend/src/api/fetch.ts` — NEW

Custom fetch function used by all orval-generated hooks. Sets the base URL (`/api`) and handles non-2xx responses:

```ts
export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const response = await fetch(`/api${url}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiRequestError(response.status, body);
  }
  return response.json();
};
```

### `packages/frontend/src/api/errors.ts` — NEW

```ts
export class ApiRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: { error?: string; message?: string; hint?: string },
  ) {
    super(body.message ?? `Request failed with status ${statusCode}`);
  }
}
```

### `packages/frontend/src/api/generated/` — GENERATED

Do not edit. Run `bun run codegen` to regenerate. Contains one file per API tag:

- `fragments.ts` — `useGetProjectsProjectIdFragments`, `useGetProjectsProjectIdFragmentsFragmentId`, `usePostProjectsProjectIdFragments`, `useDeleteProjectsProjectIdFragmentsFragmentId`
- `projects.ts` — `useGetProjects`, `useGetProjectsProjectId`, `usePostProjects`, `useDeleteProjectsProjectId`
- `index.ts` — `usePostProjectsProjectIdIndexRebuild`
- `aspects.ts`, `notes.ts`, `references.ts` — read-only hooks

### `packages/frontend/vite.config.ts` — MODIFY

Add server proxy:

```ts
server: {
  proxy: {
    "/api": {
      target: "http://localhost:3001",
      rewrite: (path) => path.replace(/^\/api/, ""),
    },
  },
},
```

### `packages/frontend/src/router.ts` — NEW

TanStack Router root + two routes. Index route fetches projects and redirects. Project route renders the shell page.

### `packages/frontend/src/main.tsx` — MODIFY

Wrap `<App />` with `<QueryClientProvider>` and `<RouterProvider>`.

### `packages/frontend/src/pages/ProjectSelectionPage.tsx` — NEW

- `useGetProjects()` from generated hooks
- Auto-redirects if one project, renders list if multiple, shows message if none

### `packages/frontend/src/pages/ProjectShellPage.tsx` — NEW

- Reads `projectId` from typed route params
- On mount: fires `usePostProjectsProjectIdIndexRebuild` mutation, then invalidates fragment queries on success
- `useGetProjectsProjectIdFragments(projectId)` for the list
- Local `useState` for selected fragment UUID

### `packages/frontend/src/components/FragmentList.tsx` — NEW

Props: `fragments`, `selectedId`, `onSelect`. Renders title, pool badge, readyStatus per row.

### `packages/frontend/src/components/FragmentDetail.tsx` — NEW

Props: `projectId`, `fragmentId`. Uses `useGetProjectsProjectIdFragmentsFragmentId(projectId, fragmentId)`. Renders title, pool, content in a `<pre>`.

---

## Implementation Order

1. Add `operationId` to every `createRoute()` call in the API (`packages/api/src/routes/`)
2. Install deps (`@tanstack/react-query`, `@tanstack/react-router`, `orval`)
3. Add Vite proxy
4. Write `src/api/fetch.ts` and `src/api/errors.ts`
5. Write `orval.config.ts`, run `bun run codegen` (API must be running), commit generated files
6. Set up router (`src/router.ts`)
7. Update `main.tsx` — `QueryClientProvider` + `RouterProvider`
8. `ProjectSelectionPage`
9. `ProjectShellPage`
10. `FragmentList` + `FragmentDetail`
11. Manual smoke test — run API + `bun run dev`, verify flow in browser
12. Update `packages/frontend/README.md`
