// Per-vault async FIFO lock. Every mutating storage-service entrypoint
// runs inside withVaultWriteLock so that draft create / restore can hold
// the lock for the duration of a snapshot pipeline without racing
// concurrent API-originated writes. Reads bypass the lock.
//
// Spec § Constraints — "Snapshot creation must drain in-flight write
// handlers, not just set a flag." The watcher's pause() drains
// chokidar-driven handlers, but API-originated writes bypass the
// watcher and would otherwise race the file copy / VACUUM INTO.

const chainsByVault = new Map<string, Promise<unknown>>();

export const withVaultWriteLock = <T>(
  vaultPath: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const previous = chainsByVault.get(vaultPath) ?? Promise.resolve();
  const next = previous.then(operation);

  // The chain must keep flowing even if an operation rejects, otherwise
  // every subsequent caller would inherit the failure. We swallow the
  // error on the chain copy only; the returned promise still rejects so
  // the actual caller sees the original error.
  chainsByVault.set(
    vaultPath,
    next.catch(() => {}),
  );

  return next;
};
