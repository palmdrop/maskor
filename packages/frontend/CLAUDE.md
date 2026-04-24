# Frontend Package — Coding Guide

Runtime: **Bun** (dev/build). React + Vite app. Never use Node equivalents.

## Stack

| Concern       | Library                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Routing       | TanStack Router (file-based routes in `src/pages/`, wired in `src/router.ts`) |
| Server state  | TanStack Query (queries/mutations via Orval-generated hooks)                  |
| Prose editor  | Tiptap (`src/components/fragments/prose-editor.tsx`)                          |
| Vim mode      | CodeMirror + `@replit/codemirror-vim`                                         |
| UI components | `src/components/ui/` — shadcn-style, Tailwind                                 |
| Forms         | react-hook-form + `@hookform/resolvers`                                       |

## API client (Orval-generated)

All API hooks live in `src/api/generated/`. **Never edit these files by hand.**

To regenerate (requires the API server to be running):

```bash
bun run codegen
```

All requests go through `src/api/fetch.ts` (`customFetch`), which:

- Prefixes the URL with `/api` (proxied by Vite to avoid CORS)
- Throws `ApiRequestError` on non-2xx responses
- Returns `{ data, status, headers }` envelope

Always use the generated hooks (`useGetFragment`, `useUpdateFragment`, etc.) — never call `fetch` directly in components.

## Vault events (SSE)

`src/hooks/useVaultEvents.ts` subscribes to `GET /projects/:id/events` via `EventSource`. On any vault sync event, it broad-invalidates all TanStack Query keys scoped to that project. Mount this hook once at the project shell level (`ProjectShellPage`).

The event source URL must go through the Vite proxy (`/api/...`), not hardcoded to `localhost:3001`.

> **TODO**: `useVaultEvents` still uses a hardcoded `localhost:3001` URL — fix to go through the proxy.

## Fragment editor

`FragmentEditor` (`src/components/fragments/fragment-editor.tsx`) is the main editing surface. It combines:

- `ProseEditor` (Tiptap) for content
- `FragmentMetadataForm` for metadata (aspects, readiness, notes, references)
- Save / Discard / Restore actions via Orval mutations

**Save flow**: collect metadata from `metadataFormRef`, collect content from `proseEditorRef`, then call `updateFragment`. The API writes through to the Obsidian vault — Obsidian is the file-level source of truth, but users edit through this UI.

## Routes

| Path                                        | Component                                                   |
| ------------------------------------------- | ----------------------------------------------------------- |
| `/`                                         | `ProjectSelectionPage` (auto-redirects if only one project) |
| `/projects/:projectId`                      | `ProjectShellPage`                                          |
| `/projects/:projectId/fragment/:fragmentId` | `FragmentPage`                                              |

Search param `?fragment=<uuid>` on the project route is used to highlight/select a fragment.

## Adding a new page

1. Create `src/pages/<Name>Page.tsx`.
2. Add a route in `src/router.ts`.
3. If it's project-scoped, mount under the `projectRoute` parent and read `projectId` from `useParams`.
