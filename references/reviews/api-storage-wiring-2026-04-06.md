# Review: API-Storage Wiring Feature

**Date**: 2026-04-06
**Reviewer**: Code Reviewer Agent
**Scope**: `packages/api` (new), `packages/storage` (modified)

---

## Summary

The implementation is solid overall — plan adherence is high, error handling is centralized correctly, and the testing approach (real vault, `app.request()`) is exactly right. There are no catastrophic bugs. However, there are several real issues: a type assertion that should be a cast-to-never, a security gap in `vaultPath`, a silent type-safety hole in how `projectContext` is consumed across route files, a critical missing test for the stale-index scenario (the main new behavior), and a handful of coding standards violations.

---

## Issues

### CRITICAL

**`projectId as never` in `resolve-project.ts` (line 13) and `projects.ts` (lines 22, 48)**

`storageService.resolveProject(projectId as never)` and `storageService.removeProject(projectId as never)` — using `as never` to satisfy the branded `ProjectUUID` type is the wrong tool. `as never` is "lie to TypeScript as hard as possible"; it will silence any type mismatch, including completely wrong types. The correct approach is `as ProjectUUID` (a single cast to the target brand) or ideally a runtime-validated helper that wraps the string in the branded type.

`never` as a cast target is the nuclear option — it tells the compiler "this value can never exist" and suppresses all type checking at that call site. A future refactor to `resolveProject`'s signature will not catch it. Replace with `projectId as ProjectUUID` and import `ProjectUUID` from `@maskor/shared`.

This pattern appears three times: `resolve-project.ts:13`, `projects.ts:22`, `projects.ts:48`.

---

**No test for `STALE_INDEX` behavior — the core new contract**

The plan's most significant addition to the storage layer is the `FILE_NOT_FOUND` → `STALE_INDEX` re-throw in `storage-service.ts`, and the corresponding 404 + `hint: "index_may_be_stale"` response in `errors.ts`. There is no test that exercises this path. The test suite exercises `FRAGMENT_NOT_FOUND` (UUID not in index) but never the stale-index branch (UUID in index, file deleted on disk).

This is the scenario: index a fragment, delete its file directly from the filesystem without discarding through the service, then `GET /fragments/:fragmentId`. The test suite gives no confidence that the `STALE_INDEX` branch fires, returns 404, or includes the hint.

Add a test in `fragments.test.ts` that:

1. Seeds and indexes a fragment
2. Deletes the underlying file directly with `rmSync`
3. Calls `GET /projects/:projectId/fragments/:fragmentId`
4. Asserts status 404 and `body.hint === "index_may_be_stale"`

---

**`vaultPath` accepted without validation in `POST /projects` (`projects.ts:33`)**

`vaultPath` from the request body is passed directly to `registerProject` and will be used as a real filesystem path. There is no check that it:

- Is an absolute path (the plan says "absolute path" but doesn't enforce it)
- Exists on disk
- Doesn't escape a permitted root via traversal (e.g. `../../etc/passwd`)

For a local-only app this is low severity now, but once anything like Tauri/Electron wraps this, a frontend bug or a crafted request could register a project pointing at an arbitrary filesystem location. At minimum, validate `path.isAbsolute(vaultPath)` and return 400 if not. A `existsSync` check would also give a cleaner error than a downstream crash.

---

### WARNING

**`cors()` misconfiguration — wildcard CORS in `app.ts` (line 20)**

`cors()` with no arguments enables `Access-Control-Allow-Origin: *`. This is noted in the plan as a known deferral, but it's worth flagging explicitly: once the frontend has any kind of auth header, `*` will cause CORS preflight failures because credentials + wildcard are disallowed by the browser. This will break at the first auth integration. At minimum add a `// TODO:` comment documenting this and pointing to when it needs to change.

---

**`sanity.test.ts` is dead weight**

`packages/api/src/__tests__/sanity.test.ts` still exists and tests nothing — it asserts that a hand-constructed object's `method` is `"GET"`. Now that real integration tests exist, this file should be deleted. It wastes test runner time and clutters the suite.

---

**`notes.test.ts` and `references.test.ts` are absent**

The plan explicitly lists these as required files. The `aspects.test.ts` test suite is skeletal (no "read known aspect by UUID" success case, no pool filtering). Notes and references have zero test coverage. This is not just a plan deviation — it means two of the four entity types have no verified behavior.

---

**`contentHash: ""` in fragment construction (`fragments.ts:63`)**

The `POST /fragments` handler constructs a `Fragment` with `contentHash: ""`. If `contentHash` is used downstream (indexer, watcher, sequencer) for change detection or deduplication, writing an empty hash will either break that logic silently or cause every newly-written fragment to appear as "changed". This needs either a real hash (e.g. `Bun.hash` or `crypto.createHash`) or a `// TODO:` explaining why empty is safe for now.

---

**`pool` is required in `POST /fragments` — this may be wrong**

The fragment creation check at `fragments.ts:46` makes `pool` required. The `Fragment` type likely has `pool` as optional with a default (e.g. `"unplaced"`). Requiring the caller to always supply a pool is a needless API constraint if the storage layer has a sensible default. If `pool` defaults to `"unplaced"`, the API should match that — don't be stricter than the contract.

Check what `Fragment.pool` allows at the type level. If it has a default, the API should apply it when absent.

---

**Hono sub-app context variable propagation — potential silent failure**

`app.ts` injects `storageService` on the parent `app`, then mounts `projectScopedApp` as a child via `app.route("/projects/:projectId", projectScopedApp)`. Hono propagates parent context variables to child apps in most versions, but this is worth verifying explicitly. If the version in use doesn't inherit context, every `ctx.get("storageService")` in route handlers returns `undefined`, and the non-null assertion `ctx.get("storageService")` will throw at runtime rather than type-check time.

The test suite would catch this — but only because the tests pass the same `storageService` through `createApp`. Add a comment or a quick smoke test that exercises the full middleware chain (service → sub-app → handler).

---

**`GET /projects/:projectId` returns `ProjectContext`, not `ProjectRecord` (`projects.ts:22`)**

The plan specifies `GET /projects/:projectId` returns "a single project record". The implementation calls `storageService.resolveProject()`, which returns `ProjectContext` (a subset of `ProjectRecord`: only `userUUID`, `projectUUID`, `vaultPath`). This means any fields on `ProjectRecord` that aren't in `ProjectContext` (e.g. `name`) are absent from the response.

The `listProjects()` endpoint returns full `ProjectRecord` objects. The single-project endpoint silently returns less data. This is an inconsistency that will confuse frontend consumers. Fix: call `registry.findByUUID()` or expose a `getProject(uuid)` method on the service, or document clearly that the detail endpoint returns context not a full record.

---

**`createStorageService()` called with no arguments in `index.ts` (line 4)**

`createStorageService()` uses `DEFAULT_CONFIG_DIRECTORY` when no config is supplied. The actual default value is not visible from `index.ts` — if that default points somewhere surprising (e.g. `~/.config/maskor`), a developer running the server locally for the first time will be confused about where data is persisted. Add a comment or log the config directory at startup.

---

### STYLE

**`dir` abbreviation in `create-test-app.ts` (line 12) and `seed-vault.ts` (line 13, 19, etc.)**

- `create-test-app.ts:12`: `const configDir = join(tmpDir, "config")` — `configDir` should be `configDirectory`.
- `seed-vault.ts:13`: `vaultDir` in the type and on line 19 — should be `vaultDirectory`. The plan's own pseudocode uses `tmpDir` and `vaultDir`; the implementation copied those abbreviations. This violates the no-abbreviation rule.
- `projects.test.ts:13,14`: `const dir = ...` and `makeVaultDir()` — should be `makeVaultDirectory()`, `const directory = ...`.

---

**`tmpDir` throughout `create-test-app.ts` and `seed-vault.ts`**

`tmpDir` → `temporaryDirectory`. Same rule — `dir` is an abbreviation.

---

**`ctx` used as a module-level test variable name in all test files**

`let ctx: ReturnType<typeof createTestApp>` — `ctx` is an abbreviation of "context". The coding standard forbids abbreviated names unless they're standard exceptions (`id`, `uuid`, `acc`). Rename to `testContext` or `testApp`.

Note: `ctx` as a Hono handler parameter is standard in that ecosystem and acceptable as a conventional single-letter-style name (similar to `i`, `e`). But as a module-level test variable describing a full test app instance, it's not a handler-style usage — it's a named concept that deserves a name.

---

**`FIXTURES` path coupling in `projects.test.ts` (line 6) and `seed-vault.ts` (line 6)**

Both files hardcode `../../../../storage/fixtures/vault` as a relative path from their location in the tree. If either file moves, this silently breaks. `seed-vault.ts` centralizes this — `projects.test.ts` should use `seedVault` from the helper instead of duplicating the fixture logic. `projects.test.ts` only needs raw vault directories, so a `makeTempVault(tmpDirectory)` helper (or just using `seedVault`) would be cleaner.

---

**Missing `return` from multi-line arrow in `resolve-project.ts` is fine here (no violation)**

The function uses an explicit `async` function body with `return`, not a multi-line implicit arrow. No issue.

---

## Architecture Notes

**`resolveProject` called twice for `GET /projects/:projectId`**

The middleware `resolveProject` runs for all project-scoped routes. But `GET /projects/:projectId` is a _non_-project-scoped route mounted on `projectsRouter`, not on `projectScopedApp`. So for that route there's no double-call problem. However, `projectsRouter.get("/:projectId")` still calls `resolveProject` logic manually inline. That's fine — it's the non-scoped version. Just note: if someone adds `/:projectId` routes to both routers without thinking, they'll get double resolution.

**Vault cache is never invalidated on `removeProject` — but only partially**

`storage-service.ts:82-84` deletes from all three caches when a project is removed. This is correct. However, if a project's `vaultPath` changes (not currently possible through the API), the cache would serve stale vault instances. Not an issue now, but worth a `// TODO:` comment since the registry schema could allow path changes.

**`storageService` injected into sub-app context but only set on parent**

The middleware chain is: `app.use("*", set storageService)` → `app.route("/projects/:projectId", projectScopedApp)`. Hono merges contexts from parent to child when using `app.route()`. This works — but it's a subtle Hono behavior. If you later switch to `app.mount()` (which creates a fully isolated sub-application), context inheritance breaks. `app.route()` is the right choice here; leave a comment so the next person doesn't "fix" it to `app.mount()`.

**Test isolation between test files is fragile**

Each test file creates its own `TestApp` instance, which is correct. But `fragments.test.ts` depends on fixture data (at least 5 fragments), while `aspects.test.ts` expects aspects to exist without asserting how many. If the fixture vault changes, tests break silently (they check `Array.isArray` but not minimum counts for aspects). The `expect(body.length).toBeGreaterThanOrEqual(5)` in `fragments.test.ts` is better — but even this is a guess at fixture content, not a verified contract. Consider having `seedVault` return the actual counts so tests can assert against what was seeded.

---

## Questions

1. Does `Fragment.pool` have a type-level default or is it always required? This affects whether `pool` should be required in `POST /fragments`.

2. Is `contentHash` ever read by anything downstream currently? If not, the empty-string issue is latent but not yet live — still worth a `// TODO:`.

3. Is the intent of `GET /projects/:projectId` to return `ProjectRecord` (with `name`) or `ProjectContext` (without)? The inconsistency with `GET /projects` should be a deliberate decision, not an accident.

4. `notes.test.ts` and `references.test.ts` — missing intentionally (deferred) or accidentally omitted?
