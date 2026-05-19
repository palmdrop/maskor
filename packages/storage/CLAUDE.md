Every state-changing storage-service entrypoint must run inside `withVaultWriteLock(context.vaultPath, ...)`. Read-only methods don't need it.

The lock is a per-vault FIFO async chain that serializes vault mutations. Its load-bearing purpose is the draft create / restore pipeline: those operations hold the lock for the duration of the snapshot or swap, so concurrent fragment / aspect / note / sequence writes can't race the file copy or `VACUUM INTO` and the live `bun:sqlite` handle isn't written to between teardown and re-open.

If you add a new mutating method, wrap its body. If you forget, draft create / restore can corrupt the snapshot or write to a closed DB handle.

Example to mirror:

```ts
// packages/storage/src/service/storage-service.ts
import { withVaultWriteLock } from "../utils/vault-write-lock";

async write(context: ProjectContext, fragment: Fragment): Promise<Fragment> {
  return withVaultWriteLock(context.vaultPath, async () => {
    // ... existing body: vault.write, DB upsert, etc.
  });
},
```

Drafts compose both locks — `withDraftMutex` rejects concurrent draft ops (returns `DRAFT_OPERATION_IN_PROGRESS`), `withVaultWriteLock` queues concurrent writes:

```ts
return withDraftMutex(context.vaultPath, async () => {
  return withVaultWriteLock(context.vaultPath, async () => {
    // pause watcher, copy, VACUUM INTO, atomic rename
  });
});
```

Skip the lock for: `actionLog.append` (the file is preserved across restore; appends survive), registry operations (not vault-scoped), and `index.rebuild` (called from `resolveProject` middleware on first access, before any user write can race it — and from inside `drafts.restore` which already holds the lock; re-acquiring would deadlock).
