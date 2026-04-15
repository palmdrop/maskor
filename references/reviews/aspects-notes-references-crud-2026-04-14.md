# Code Review: Aspects/Notes/References CRUD

**Date**: 14-04-2026
**Plan**: `references/plans/aspects-notes-references-crud.md`
**Scope**: All non-frontend changes from the plan implementation.

---

## Issues

### 1. `STALE_INDEX` mapped to 404 — semantically wrong

**File**: `packages/api/src/errors.ts:27–33`

```ts
case "STALE_INDEX":
  throw new HTTPException(404, {
    res: errorResponse(
      { error: "NOT_FOUND", message: error.message, hint: "index_may_be_stale" },
      404,
    ),
  });
```

The client sent a valid UUID that exists in the DB index — the server just can't service it because the file has already been removed from disk (or the watcher hasn't caught up yet). This is a transient server-side inconsistency, not a "not found" from the client's perspective.

**Options:**

- **409 Conflict** — signals "the resource exists but the server state prevents completing the request." Honest about the resource being known, just not serviceable.
- **503 Service Unavailable** — signals "try again later," optionally with `Retry-After`. Best if we expect the watcher to recover the state on its own.

503 is the most accurate: STALE_INDEX is a transient gap between the file watcher catching up to a delete. The client should retry. A 409 implies the conflict needs resolution by the caller, which isn't true here.

**Suggested change:**

```ts
case "STALE_INDEX":
  throw new HTTPException(503, {
    res: errorResponse(
      { error: "SERVICE_UNAVAILABLE", message: "Index is temporarily out of sync, please retry.", hint: "index_may_be_stale" },
      503,
    ),
  });
```

Also: the `hint` field is not declared in `ErrorResponseSchema`, so it's invisible to the OpenAPI spec and any generated clients. Either add `hint` to the schema or drop it.

---

### 2. Bare `catch {}` in vault `delete` methods swallows OS errors

**Files**: `packages/storage/src/vault/markdown/vault.ts` — aspect delete ~line 237, note delete ~line 282, reference delete ~line 325

```ts
} catch {
  throw new VaultError("FILE_NOT_FOUND", `Aspect file not found: ${filePath}`, { filePath });
}
```

`unlink` can fail for reasons other than the file not existing: `EACCES` (permission denied), `EISDIR`, `EBUSY`. All become `FILE_NOT_FOUND`, which the service re-throws as `STALE_INDEX` → client sees a misleading 404 (or 503 after fix above) with no diagnostic info.

Existing pattern in the same file (e.g. `fragments.discard`) passes `{ cause }` through. The new delete methods are inconsistent.

**Suggested fix:**

```ts
} catch (cause) {
  if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === "ENOENT") {
    throw new VaultError("FILE_NOT_FOUND", `Aspect file not found: ${filePath}`, { filePath }, { cause });
  }
  throw cause;
}
```

Apply the same pattern to notes and references.

---

### 3. Non-atomic delete — missing TODO comment

**File**: `packages/storage/src/service/storage-service.ts` — all three `delete` methods

`unlink` and the DB soft-delete are two separate I/O operations. If the transaction throws after the file is already unlinked, the DB row stays active with `deletedAt = NULL`. The entity then appears in `readAll()` results pointing to a dead file path — a permanent stale entry until the next full rebuild.

This is the same known limitation as `fragments.discard`, which already has a `// TODO:` comment. The new `delete` methods have no such annotation.

**Suggested fix:** Add a comment matching the existing pattern:

```ts
// TODO: non-atomic two-step — file is unlinked before the DB row is soft-deleted.
// If the transaction fails after unlink, the DB row remains active with a dead file path.
// A subsequent full rebuild will clean it up, but until then the entity appears stale.
```

---

### 4. List tests assert `body.length > 0` — fragile against seed changes

**Files**: `packages/api/src/__tests__/routes/aspects.test.ts:27`, `notes.test.ts:27`, `references.test.ts:25`

```ts
expect(body.length).toBeGreaterThan(0);
```

This passes trivially if `seedVault` contains the entity type, and silently becomes a false negative (200 with an empty array) if the seed ever changes. The `GET /:id` tests already do the right thing by pulling an ID from the list response — the list test could at minimum assert on a specific known key/title from the seed data.

---

## Non-Issues (closed)

- **`throwStorageError` vs `handleStorageError` in CLAUDE.md** — the rename is intentional. The CLAUDE.md docs are out of sync; update `packages/api/CLAUDE.md` to use `throwStorageError` (no `ctx` argument).
