# Review: Frontend API Integration

**Date**: 08-04-2026
**Reviewer**: Code Reviewer Agent
**Scope**: First end-to-end flow — orval codegen setup, routing, query hooks, custom fetch mutator, and all handwritten UI components.

---

## Summary

The architectural choices (orval, TanStack Router, TanStack Query, Vite proxy) are sound and match the plan. The structure is clean for a first-pass integration. However, there is one critical runtime bug that will cause a blank/broken UI on first load: the generated hook return types and the custom fetch mutator are structurally mismatched, and the consumer code silently accesses wrong properties. There are also two correctness issues in the routing/rebuild logic that will produce confusing UX. Nothing here requires an architectural rethink — all issues are surgical fixes.

---

## Issues

### CRITICAL

**1. `customFetch` returns a raw parsed body, but the generated hooks type it as a discriminated envelope — consumers access the wrong shape at runtime.**

`customFetch` in `packages/frontend/src/api/fetch.ts` returns `response.json()` directly — a plain `T`. But orval, when no `httpClient` override is set at the orval config level, generates `listFragmentsResponse`, `getFragmentResponse`, etc. as discriminated unions shaped like `{ data: T, status: number, headers: Headers }`. The actual value at runtime is the raw array (e.g. `IndexedFragment[]`), but the TypeScript type is `listFragmentsResponse`. This means:

- `const { data: fragments } = useListFragments(projectId)` — `fragments` is typed as `listFragmentsResponse`, so TypeScript believes `fragment.uuid` is valid when in fact `fragments` at runtime is the raw array, not the envelope.
- In `router.ts`, `listProjects()` returns `listProjectsResponse` typed, but the code does `projects.length` and `projects[0].projectUUID` — accessing array properties on what TypeScript believes is a union envelope, and at runtime is actually the raw array.
- Both typecheck and runtime are misaligned in opposite directions: TypeScript will likely complain (`data` not in scope), but even if it does not, the semantics are wrong.

The fix has two options:

- **Option A (recommended)**: Add `useOptions: true` and `override.response` to the orval config so it generates a simple `T`-returning hook instead of the envelope pattern. Or configure `httpClient` mode in orval to disable envelope generation.
- **Option B**: Unwrap in `customFetch`: instead of `return response.json()`, return `{ data: await response.json(), status: response.status, headers: response.headers }` to match the envelope shape the generated code expects.

Option B is simpler. The plan's example `customFetch` matches Option A (plain `return response.json()`), but the generated output does not match that intent — this is an orval configuration gap the plan did not fully resolve.

---

**2. `ProjectSelectionPage` duplicates the redirect logic that `beforeLoad` in `router.ts` already executes — with a race between them.**

`router.ts` `beforeLoad` calls `listProjects()` (bare fetch, no TanStack Query cache) and redirects if `projects.length === 1`. Then `ProjectSelectionPage` mounts, calls `useListProjects()` (a new TQ query), and if there is one project it will... do nothing — there is no redirect in the page component. The redundancy is harmless but misleading. The real problem is the opposite: if `beforeLoad` fails silently (e.g. API is down), `ProjectSelectionPage` renders, `useListProjects()` fires, and the user sees the error state from the hook. This is fine. But:

- `beforeLoad` calls `listProjects()` outside TanStack Query — the result is not cached. The page then fires a second request for the same data. This doubles the requests on every `/` load.
- The `beforeLoad` fetch has no error handling. If it throws, TanStack Router will surface an unhandled error boundary rather than falling back gracefully.

Fix: either use `loader` with `ensureData` via a `queryOptions` helper (the idiomatic TanStack Router v1 approach for pre-fetching TQ queries), or drop the `beforeLoad` entirely and handle the single-project redirect inside `ProjectSelectionPage` using `useEffect` after the `useListProjects` hook resolves.

---

### WARNING

**3. Rebuild fires on every render cycle that produces a new `triggerRebuild` reference — the `useEffect` dep array is correct, but `triggerRebuild` is unstable across re-renders until StrictMode double-invoke settles.**

In `ProjectShellPage.tsx`:

```ts
const { mutate: triggerRebuild } = rebuildMutation;

useEffect(() => {
  triggerRebuild({ projectId });
}, [projectId, triggerRebuild]);
```

`useMutation` returns a stable `mutate` reference, so this is safe in production. In React 18 StrictMode (which is enabled in `main.tsx`), the effect fires twice on mount (mount → unmount → mount). This means two simultaneous rebuild POSTs fire on every navigation to a project. The second one may race with the first. In dev this produces confusing double-rebuilds; in production it is fine. This is known React StrictMode behaviour and worth a `// TODO:` comment explaining the double-fire in dev is expected.

**4. `useListFragments` is called before `rebuildMutation.onSuccess` has fired — the initial fragment list will be from the pre-rebuild index.**

The rebuild mutation is fire-and-forget via `useEffect`. `useListFragments` fires immediately on render. With `staleTime: 0` and `retry: 1`, the fragment query will fetch before the rebuild completes, show whatever is in the stale index, then `onSuccess` invalidates and a second fetch runs. This is probably the intended behaviour for this demo, but it is not documented. Users will briefly see stale data on every load. Add a `// TODO:` noting this.

**5. `router.ts` imports `listProjects` — a raw fetch function that bypasses TanStack Query entirely, and is not the same `listProjects` exported from the generated hooks.**

`import { listProjects } from "./api/generated/projects/projects"` — this is the bare async function, not a hook. This is valid for `beforeLoad`. But the returned value is typed as `listProjectsResponse` (the discriminated envelope), and the code accesses `projects.length` and `projects[0].projectUUID` directly. If the customFetch envelope issue (Issue 1) is resolved by Option B, this code breaks — `projects` would be `{ data: Project[], status: 200, headers: Headers }` and `projects.length` would be `undefined`. If resolved by Option A (plain body return), it works. The code is correct only under one resolution path, and it is fragile.

**6. `getFragment` param schema in `fragments.ts` route uses `FragmentUUIDParamSchema` which presumably contains only `fragmentId`, but the route is nested under `/projects/:projectId/`. If `FragmentUUIDParamSchema` does not include `projectId`, the project ID is silently unavailable via `ctx.req.valid("param")` in the handler.**

Looking at the handler: `getFragmentRoute` uses `request: { params: FragmentUUIDParamSchema }` — no `projectId` in the params schema. The handler reads `ctx.get("projectContext")!` (set by middleware), so it does not need `projectId` from params. This is correct by design. However it is worth noting because orval generates `getFragment(projectId, fragmentId, ...)` by inferring `projectId` from the URL path, not from the Zod schema. So the URL parameter is used by orval for URL construction but is not validated by the Hono Zod schema. If someone passes a mismatched `projectId` in the URL, the middleware resolves the context from the actual path param, not the schema-validated one. This is a pre-existing design gap but worth flagging.

---

### MINOR

**7. `projectIdParamSchema` is redefined in four separate route files (`fragments.ts`, `aspects.ts`, `notes.ts`, `references.ts`, `vault-index-routes.ts`).**

All five files declare `const projectIdParamSchema = z.object({ projectId: z.uuid() })` identically. This should be extracted to a shared schema file (e.g. `src/schemas/shared.ts`) and imported. It is not a bug, but divergence over time is likely (e.g. one file adds a `.describe()` the others don't).

**8. `ApiRequestError` does not call `super()` with `name` set — `error.name` will be `"Error"` not `"ApiRequestError"`.**

```ts
export class ApiRequestError extends Error {
  constructor(...) {
    super(body.message ?? `Request failed with status ${statusCode}`);
    // name is never set
  }
}
```

`instanceof` checks will work, but `error.name` (used for display and logging) will be `"Error"`. Convention is to add `this.name = "ApiRequestError"` after the `super()` call. Low impact now, matters once error logging is added.

**9. Vite proxy is missing `changeOrigin: true`.**

```ts
proxy: {
  "/api": {
    target: "http://localhost:3001",
    rewrite: (path) => path.replace(/^\/api/, ""),
    // missing: changeOrigin: true
  },
},
```

Without `changeOrigin`, the proxied request sends the original `Host: localhost:5173` header to the API. Most Node/Bun HTTP servers accept this, but some middleware (or future CORS configuration) may reject or behave differently. This is harmless today but a latent issue.

**10. `orval.config.ts` has no `baseUrl` override and targets the live API server only — there is no offline/CI fallback configured.**

The plan acknowledges this as deferred ("Start with live spec; add snapshot once CI is configured"). But there is no `// TODO:` comment in the file, and running `bun run codegen` without the API running fails silently or with a confusing network error. Add a comment.

---

### NIT (Coding Standards)

**11. Multi-line arrow functions in generated files lack explicit `return` (generated code, not actionable) — but `customFetch` itself is fine.**

Not actionable for generated files. Flagging for awareness.

**12. The `rewrite` function in `vite.config.ts` uses an inline regex without a `_REGEX`-suffixed constant.**

```ts
rewrite: (path) => path.replace(/^\/api/, ""),
```

Per coding standards, regex literals should be named constants ending in `_REGEX`. For a one-liner config this is low impact, but it is a standards violation.

The regex itself also has no flags — this is correct for a path prefix match.

**13. `ProjectShellPage` state variable `selectedFragmentId` could be named more precisely — it is a UUID, not a generic "id".**

`useState<string | null>(null)` with the name `selectedFragmentId` is fine per the `id` exception in coding standards. No change needed.

---

## Architecture Notes

- **The orval envelope pattern is the highest risk.** Orval's default output mode generates a discriminated union response type when a custom mutator is provided, but the actual runtime value depends entirely on what the mutator returns. The plan intended a flat `T` return (matching the example in the plan doc), but the generated types do not match that intent. This needs to be resolved before any consumer code can be trusted. Consult orval's `useOptions` or `httpClient` config options.

- **`beforeLoad` vs `loader` for data pre-fetching.** TanStack Router v1 has `loader` as the proper integration point for TanStack Query prefetching. `beforeLoad` is for auth guards and redirects. Using `beforeLoad` to fetch data is non-idiomatic and bypasses the cache. Consider moving the single-project redirect to `ProjectSelectionPage` (after hook resolves) and dropping the `beforeLoad` entirely, keeping routing concerns in the router and data concerns in query hooks.

- **The `CLAUDE.md` for the API package documents `handleStorageError(error, ctx)` but the actual export is `throwStorageError(error)` (which takes no `ctx` argument).** The CLAUDE.md is stale. The implementation is correct — `throwStorageError` always throws (returns `never`), so `return throwStorageError(error)` in catch blocks is valid for type narrowing. The doc just needs updating.

- **No error boundary is installed at the router level.** TanStack Router supports `errorComponent` at the route level. With the current setup, any unhandled async error in `beforeLoad` or a render will produce a blank screen. This is deferred per the plan, but worth a `// TODO:` at the root route definition.

---

## Open Questions

1. **Orval envelope resolution (Issue 1)**: Did you verify the generated hooks actually return the right shape at runtime by inspecting the network response vs. the TypeScript type? The mismatch is type-level and may typecheck incorrectly depending on whether `strict` catches it. Have you run the full flow in the browser and confirmed data renders?

2. **`beforeLoad` intent**: Was the `listProjects()` call in `beforeLoad` meant to pre-populate the TQ cache (so `ProjectSelectionPage` gets an instant result), or just for the redirect? If cache population was the goal, the current approach does not achieve it — `listProjects()` is called outside Query context.

3. **Rebuild on every mount**: Is firing a full rebuild on every navigation to a project intentional? For large vaults this could be slow. Was this considered a temporary measure until the watcher keeps the index live?
