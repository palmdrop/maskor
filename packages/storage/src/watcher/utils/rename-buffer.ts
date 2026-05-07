const RENAME_BUFFER_MS = 500;

type PendingEntry = {
  oldKey: string;
  filePath: string;
  timer: ReturnType<typeof setTimeout>;
  onExpire: () => void;
};

export type RenameCheckResult =
  | { kind: "rename"; oldKey: string }
  | { kind: "collision"; filePath: string }
  | null;

export type RenameBuffer = {
  add(uuid: string, oldKey: string, filePath: string, onExpire: () => void): void;
  check(uuid: string, newKey: string): RenameCheckResult;
  drainAll(): void;
};

// Buffers unlink events for a short window to correlate with a subsequent add
// on the same UUID (rename) or the same key slot (replacement by a different file).
export const createRenameBuffer = (): RenameBuffer => {
  const byUuid = new Map<string, PendingEntry>();
  const byKey = new Map<string, string>(); // key → uuid

  return {
    add(uuid, oldKey, filePath, onExpire) {
      const timer = setTimeout(() => {
        byUuid.delete(uuid);
        byKey.delete(oldKey);
        onExpire();
      }, RENAME_BUFFER_MS);
      byUuid.set(uuid, { oldKey, filePath, timer, onExpire });
      byKey.set(oldKey, uuid);
    },

    check(uuid, newKey) {
      const entry = byUuid.get(uuid);
      if (entry) {
        clearTimeout(entry.timer);
        byUuid.delete(uuid);
        byKey.delete(entry.oldKey);
        return { kind: "rename", oldKey: entry.oldKey };
      }

      const pendingUuid = byKey.get(newKey);
      if (pendingUuid !== undefined) {
        const collisionEntry = byUuid.get(pendingUuid)!;
        clearTimeout(collisionEntry.timer);
        byUuid.delete(pendingUuid);
        byKey.delete(newKey);
        return { kind: "collision", filePath: collisionEntry.filePath };
      }

      return null;
    },

    drainAll() {
      for (const entry of byUuid.values()) {
        clearTimeout(entry.timer);
        entry.onExpire();
      }
      byUuid.clear();
      byKey.clear();
    },
  };
};
