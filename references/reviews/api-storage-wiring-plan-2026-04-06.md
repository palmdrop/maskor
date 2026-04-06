# Review: API + Storage Wiring Plan

**Date**: 06-04-2026
**Reviewer**: Code Reviewer Agent

---

## Summary

The plan is well-structured and the core architectural decisions are sound — Hono context injection, per-layer error mapping, integration tests without mocks. The `STALE_INDEX` prerequisite is the right instinct. However, there are several real gaps: the `STALE_INDEX` re-throw logic in `storage-service.ts` is unimplementable as described, the error taxonomy has an internal contradiction, the `projectContext` typing is unsound for unset routes, and the `POST /fragments` request shape is never defined. These are concrete blockers or future footguns, not style nits.

---

## Issues

### CRITICAL

- **The `STALE_INDEX` re-throw is unimplementable as described.**
  The plan says: _"Only re-throw as `STALE_INDEX` when the path came from an index lookup — genuine missing files from direct paths should remain `FILE_NOT_FOUND`."_ But looking at `storage-service.ts`, `fragments.read` already checks the index first and throws `FRAGMENT_NOT_FOUND` if nothing is found. The only code path that reaches `vault.fragments.read(filePath)` is one where the path _did_ come from the index. There is no ambiguity to detect. The distinction the plan is trying to preserve doesn't exist in the current code — both paths are already index-derived. The instruction to "only re-throw when the path came from an index lookup" will either be ignored in practice or produce dead conditional logic. **Fix:** simplify the prerequisite: in `fragments.read` and `aspects/notes/references.read`, wrap the `vault.*.read(filePath)` call in a try/catch and unconditionally re-throw `FILE_NOT_FOUND` as `STALE_INDEX`, since at that callsite the path is always index-derived.

- **Open Question 5 contradicts Section 4 — the plan disagrees with itself on `STALE_INDEX` status code.**
  Section 4 maps `STALE_INDEX` → **404**. Open Question 5 floats **409 Conflict** for `FILE_NOT_FOUND` (the thing `STALE_INDEX` replaces). These refer to the same situation. Having a numbered open question that contradicts a decided section is a plan smell — a future implementer will not know which to follow. **Fix:** resolve this before implementation. 404 is the right call. A stale index means the resource is _effectively absent_ from the API's perspective; 409 implies a conflict between two valid states, which is semantically wrong here.

### WARNING

- **`projectContext` in `AppVariables` is optional-by-convention but typed as required.**
  The plan defines `AppVariables` with `projectContext: ProjectContext` (non-optional). But routes like `GET /projects` run without the `resolveProject` middleware and never set it. Calling `c.get("projectContext")` on a non-project-scoped route would return `undefined` at runtime while TypeScript believes it is always defined. Hono's `c.get()` typing for unset variables returns `undefined` in practice. **Fix:** type it as `projectContext?: ProjectContext`, then use a narrowing assertion in project-scoped handlers (or rely on the middleware to guarantee it's set). Alternatively, use a separate sub-app type for project-scoped routes.

- **`POST /projects` accepts `vaultPath` from the request body, but `vaultPath` is a local filesystem path.**
  For a local-only app this is fine now, but the plan has no note acknowledging this. When the frontend runs in a browser (even via Tauri/Electron), this means the user or the client must supply a raw filesystem path in the request body. This is a UX cliff: how does the browser-side frontend know the vault path? **Fix:** add a deferred note. Either the frontend reads it from a config, exposes a file picker over IPC, or the API exposes a path-validation/discovery endpoint. Don't leave this implicit.

- **No HTTP method for `POST /projects/:projectId/fragments` defines its request body shape.**
  The plan lists the route but never specifies what the body looks like. Does it accept a full `Fragment` object? A partial (title + content, UUID generated server-side)? The `StorageService.fragments.write` signature takes a full `Fragment`, but a write via HTTP shouldn't require the client to supply a UUID. The plan defers body validation to Open Question 2 but doesn't even name the shape. This is a real design gap. **Fix:** add at minimum a note defining the expected body fields and whether the server or client generates the UUID.

- **Test helper `create-test-app.ts` says "cleans up temp directory after test" with no mechanism specified.**
  The plan doesn't say _when_ or _how_ cleanup happens — `afterAll`, `afterEach`, or a returned `cleanup()` function. In Bun, failing tests don't always run `afterAll`. If the temp directory leaks between test runs, tests can observe stale fixture state. **Fix:** specify that `createTestApp` returns a `{ app, cleanup }` tuple, and tests are responsible for calling `cleanup()` in `afterAll`. Flag in the plan that this is important for test isolation.

- **`resolveProject` middleware is described as a "middleware factory" but the plan doesn't say what it's parameterised on.**
  If it's a factory, what argument does it take? If it's just a plain middleware that reads from `c.var.storageService` and the `:projectId` param, call it that. The word "factory" implies a function that returns a middleware, which would suggest it takes a `StorageService` argument — but the plan already handles service injection at the app level. **Fix:** clarify: is it `resolveProject` (a plain middleware that reads `storageService` from context) or `createResolveProjectMiddleware(service)` (a factory)? The plain middleware approach is simpler and consistent with how `storageService` is already injected.

- **CORS middleware is mentioned once in `index.ts` and once in `app.ts` with no decision on which owns it.**
  The plan says `app.ts` creates and exports `createApp(storageService)` which "Registers all middleware and routes", but also says `index.ts` "Add CORS middleware". If CORS lives in `index.ts` it won't be present during tests (which use `createApp` directly). **Fix:** CORS belongs in `app.ts` / `createApp`. Remove it from the `index.ts` description.

### STYLE

- **`c` is used as the Hono context variable name throughout the plan's code snippets.**
  The coding standards prohibit single-letter abbreviations except for iterators (`i`). `c` for context is idiomatic in Hono but not acceptable here. **Suggested name:** `ctx` — two characters but unambiguous, and consistent with how Hono itself documents typed variables in its own examples. Apply this consistently across all handler signatures.

- **`index-routes.ts` is a weak name.**
  The file handles index rebuild operations; the "index" prefix is already in the route path. `index-routes.ts` reads like a barrel file. **Suggested name:** `rebuild-routes.ts` or `vault-index-routes.ts`.

---

## Architecture Notes

**The plan correctly avoids the global-singleton trap.** Injecting `StorageService` via Hono context variables is the right call for testability. The split between `app.ts` (testable factory) and `index.ts` (process entrypoint) is standard and good.

**The `STALE_INDEX` prerequisite is architecturally correct** — leaking filesystem-level error codes through the API layer would couple the API to storage internals. The instinct is right even if the implementation description has the problem noted above.

**Deferring write endpoints for aspects/notes/references is sound.** The storage layer supports them; don't expose surface area the frontend doesn't need yet. YAGNI applies.

**The explicit rebuild route is the right tradeoff for this stage.** The plan correctly anticipates the watcher transition and notes that the route becomes a manual override rather than a primary mechanism. No issue here.

**No HTTP 201 on resource creation.** The plan doesn't mention status codes for `POST /projects` (register) or `POST /fragments` (write). Both should return 201 with the created resource, not 200. Add this to the route spec.

**No `GET /projects/:projectId` singular route.** You have list + delete on the registry, but no way to fetch a single project record. This is a minor but real gap — the frontend will likely want to display project metadata. Consider adding it to the milestone scope since it's trivial to implement alongside the list route.

**The `?pool=:pool` filter notation is nonstandard.** Standard URL query param notation is `?pool=poolname`, not `?pool=:pool`. The colon makes it look like a path parameter template. Fix the notation in the plan doc (cosmetic, but confusing).

---

## Questions

1. When `POST /projects/:projectId/fragments` is called, does the client supply a UUID or does the API generate one? The `Fragment` type in `@maskor/shared` presumably requires a UUID — this needs a decision before the route is implemented.

2. Is `createStorageService` (factory function) the export, or is `StorageService` a class? The plan's code shows `new Hono<{ Variables: AppVariables }>()` but the storage service uses the factory pattern (`createStorageService()`). The `createApp` signature should match — confirm it's `createApp(service: StorageService)` where `StorageService = ReturnType<typeof createStorageService>`.

3. The plan mentions using `@maskor/storage/fixtures/vault` for tests. Does that fixture vault have content in all entity types (fragments, aspects, notes, references)? If not, `seed-vault.ts` needs to create all of them from scratch rather than relying on the fixture.
