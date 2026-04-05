# Review: Sessions and Projects Implementation

**Date**: 05-04-2026
**Reviewer**: code-reviewer agent
**Files reviewed**: `packages/storage/src/db/`, `packages/storage/src/registry/`, `packages/storage/src/service/`, `packages/storage/src/__tests__/registry.test.ts`, `packages/storage/src/__tests__/storage-service.test.ts`, `packages/shared/src/types/domain/project.ts`

---

## Summary

The implementation faithfully follows the plan. The core architecture — `createRegistryDatabase` → `createProjectRegistry` → `createStorageService` — is clean and the layering is correct. Tests cover the happy paths and critical error paths well. There are no show-stopper bugs, but there are several correctness risks and coding standard violations that should be addressed before this is considered stable.

---

## What Was Implemented Well

- **Architecture matches the plan exactly.** `StorageService` only _consumes_ `ProjectContext`; it does not create it. The hosting-readiness separation is respected.
- **`ProjectNotFoundError` carries structured data.** The `projectUUID` field on the error class is a good touch — callers can inspect it without parsing the message string.
- **Vault cache eviction on `removeProject`.** This is easy to forget and it's done correctly.
- **`import.meta.dir` for migrations path.** Using `import.meta.dir` in `db/index.ts` rather than a relative path string is the right call for Bun — it stays correct regardless of where the process is started.
- **`MASKOR_CONFIG_DIR` override for test isolation.** Tests use temp dirs and never pollute `~/.config/maskor`. This is correct.
- **`mkdirSync` in `createRegistryDatabase`.** Ensures the config directory exists before opening the DB, so first-run on a fresh machine works without extra setup.
- **Plan file updated with `status: Done` and `implementedAt`.** Follows the CLAUDE.md planning protocol.

---

## Issues

### Critical

**`writeVaultManifest` does not create `.maskor/` before writing**

`packages/storage/src/registry/registry.ts` lines 21–30.

`Bun.write` does _not_ create intermediate directories. If `.maskor/` does not already exist inside the vault, this will fail silently or throw depending on the platform. There is no `mkdir` call before the write. The manifest write will fail on every fresh vault, making `registerProject` unreliable.

Suggested fix:

```ts
import { mkdirSync } from "node:fs";
const maskorDirectory = join(vaultPath, ".maskor");
mkdirSync(maskorDirectory, { recursive: true });
await Bun.write(join(maskorDirectory, "project.json"), ...);
```

---

**`registerProject` is not atomic — DB write succeeds but manifest write can fail**

`packages/storage/src/registry/registry.ts` lines 43–52.

The DB insert happens before `writeVaultManifest`. If the manifest write fails (e.g. permissions, missing directory — see above), the project is registered in the DB but has no vault manifest. The vault is now "registered" but the manifest invariant the plan relies on (vaults are self-describing) is violated. There is no rollback.

Suggested fix: write the manifest first, then insert into the DB. If the DB insert fails after a successful manifest write, the worst case is a stale manifest file — which is a much less harmful inconsistency than a ghost DB record. Alternatively, wrap both in a try/catch and delete the DB row on manifest failure.

---

**`removeProject` does not verify the project existed**

`packages/storage/src/registry/registry.ts` line 79.

`database.delete(...).where(...)` in Drizzle silently succeeds even if no row matched. Calling `removeProject` with a non-existent UUID returns `void` successfully. This is inconsistent with `resolveProject`, which throws `ProjectNotFoundError` for unknown UUIDs. Callers removing a project that was already removed (or never existed) get no feedback.

Whether this should throw is a design call, but the current asymmetry is a bug risk.

---

### Major

**`toProjectRecord` uses manual property mapping instead of spread**

`packages/storage/src/registry/registry.ts` lines 9–18.

This violates the spread-syntax standard and is fragile — if `ProjectRecord` gains a new field, `toProjectRecord` will silently omit it. The schema field names diverge from the domain names (`uuid` → `projectUUID`, `userUuid` → `userUUID`), so a full spread is not possible, but the function should document that remapping explicitly and be as minimal as possible:

```ts
const toProjectRecord = (row: typeof projectsTable.$inferSelect): ProjectRecord => {
  return {
    ...row,
    projectUUID: row.uuid as ProjectUUID,
    userUUID: row.userUuid as UserUUID,
  };
};
```

This requires removing the conflicting `uuid` and `userUuid` keys via destructuring before spreading, or handling the name collision explicitly — but it is still more maintainable than listing every field by hand.

---

**`registerProject` constructs the return value manually instead of using `toProjectRecord`**

`packages/storage/src/registry/registry.ts` lines 54–61.

The return value of `registerProject` is constructed by hand rather than using `toProjectRecord`. This means the two code paths that produce a `ProjectRecord` can diverge. If `toProjectRecord` is updated, `registerProject`'s return value will drift. The simplest fix is to call `findByUUID` after insert, or to factor out a `buildProjectRecord` helper that both paths use.

---

**`resolveProject` constructs `ProjectContext` by hand from `ProjectRecord` fields**

`packages/storage/src/service/storage-service.ts` lines 38–42.

`ProjectContext` is a strict subset of `ProjectRecord`. The construction is safe as written, but spread would be cleaner and more robust:

```ts
const { userUUID, projectUUID, vaultPath } = record;
return { userUUID, projectUUID, vaultPath };
```

This is a minor violation of the spread standard but is worth noting because `ProjectContext` and `ProjectRecord` sharing fields is intentional by design.

---

**`DEFAULT_CONFIG_DIRECTORY` falls back to literal `"~"` if `HOME` is unset**

`packages/storage/src/db/index.ts` line 11.

`process.env["HOME"] ?? "~"` — if `HOME` is unset (unusual but possible in CI or containerized environments), the path becomes `~/.config/maskor` as a literal string, not the user's home directory. `"~"` is a shell alias, not a resolved path. `bun:sqlite` will create a file at a relative `~/.config/maskor/registry.db` path from the CWD, not the home directory. Use `os.homedir()` from `node:os` instead:

```ts
import { homedir } from "node:os";
export const DEFAULT_CONFIG_DIRECTORY =
  process.env["MASKOR_CONFIG_DIR"] ?? join(homedir(), ".config", "maskor");
```

---

**`stat` import comes from `node:fs/promises` — prefer `Bun.file` for consistency**

`packages/storage/src/registry/registry.ts` line 3.

The rest of the storage layer uses `Bun.file` and `Bun.write`. The vault path existence check uses `node:fs/promises`'s `stat`. This is not wrong, but it's inconsistent with the CLAUDE.md directive to prefer Bun APIs. `Bun.file(vaultPath).exists()` cannot distinguish between "file" and "directory", so `stat` is understandable here — but this should be documented with a comment:

```ts
// TODO: Bun.file().exists() cannot distinguish file vs directory — keeping node:fs/promises stat for now
```

---

### Minor

**`registry.test.ts` lines 57 and 63: missing `await` on `.rejects` assertions**

```ts
expect(registry.registerProject("Bad Project", "/nonexistent/path")).rejects.toThrow();
expect(registry.registerProject("Bad Project", filePath)).rejects.toThrow();
```

Neither is `await`ed. In Bun's test runner, an unawaited `.rejects` chain may not actually assert — if the promise resolves, the test passes silently. This should be:

```ts
await expect(registry.registerProject(...)).rejects.toThrow();
```

The same pattern appears in `storage-service.test.ts` lines 60 and 78. Four tests total are potentially hollow.

---

**`db/index.ts` uses `node:fs` `mkdirSync` while the rest of the layer uses Bun APIs**

`packages/storage/src/db/index.ts` line 5.

`mkdirSync` is synchronous and from `node:fs`. Since `createRegistryDatabase` is already synchronous (Drizzle with bun:sqlite is sync), `mkdirSync` is acceptable here — but should be noted. `Bun.mkdirSync` does not exist; the alternative would be `await mkdir(...)` with an async factory. Either way, add a brief comment explaining the sync choice.

---

**`toProjectRecord` casts `row.userUuid` to `typeof LOCAL_USER_UUID` instead of `UserUUID`**

`packages/storage/src/registry/registry.ts` line 12.

```ts
userUUID: row.userUuid as typeof LOCAL_USER_UUID,
```

`typeof LOCAL_USER_UUID` is `UserUUID` (since `LOCAL_USER_UUID = "local" as UserUUID`), so this is technically equivalent — but it reads as casting to the _value_ `"local"` rather than the _type_ `UserUUID`. It's confusing and violates the "no redundant intermediate casts" spirit. Use `as UserUUID` directly.

---

**`project.ts` has `archUUIDs: Arc[]` — should be `arcUUIDs: Arc[]`**

`packages/shared/src/types/domain/project.ts` line 16.

Likely a typo. This is the `Project` type in `@maskor/shared`, which also received the `vaultPath` addition as part of this plan. While this typo predates this PR (it's in the existing type), the plan touched this file and the typo should have been caught.

---

## Missing Pieces from the Plan

**`registry/index.ts` re-exports `registry.ts`'s `createProjectRegistry` but not via the planned `registry/index.ts` barrel**

Actually present — this is correctly implemented. No gap here.

**No `updateProject` method**

The plan does not specify one, so this is not a gap — but `updatedAt` is stored in the schema and never updated. If `registerProject` is the only mutation, `updatedAt` will always equal `createdAt`. Either add an `updateProject` method (even just to rename a project) or add a `// TODO:` on the `updatedAt` column explaining it is reserved for future use.

**Vault manifest is not read back on startup**

The plan describes the `.maskor/project.json` manifest as making vaults "self-describing and portable". But there is no code that reads an existing manifest to re-register a project. If the registry DB is lost (corrupted or deleted), there is no recovery path that uses the manifests. A `// TODO:` should mark this gap in `registry.ts`.

**No `bun run typecheck` or `bun test` evidence in the diff**

The plan's Verification section requires both. The README and plan are marked done, but there is no record of tests passing. This should be verified before closing the plan.

---

## Suggestions

1. Fix the four unawaited `.rejects` assertions immediately — they are silently non-asserting tests that give false confidence.
2. Fix `writeVaultManifest` to `mkdirSync` the `.maskor/` directory before writing.
3. Swap `process.env["HOME"] ?? "~"` for `homedir()` from `node:os` in `db/index.ts`.
4. Add `// TODO:` to `updatedAt` in the schema explaining it is reserved for future `updateProject` support.
5. Add `// TODO:` to `registry.ts` explaining that manifest-based recovery (when DB is lost) is not yet implemented.
6. Consider whether `removeProject` should throw on a no-op delete. At minimum, document the current behavior with a comment.
7. Fix `archUUIDs` → `arcUUIDs` typo in `packages/shared/src/types/domain/project.ts` (pre-existing, but touched in this diff).
