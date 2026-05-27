// In-memory map of UUIDs deleted via the rename-buffer expiry path. Used by the
// keyed-entity sync path to mark a returning entity with `revived: true` when an
// `add` event fires for a UUID that was just deleted (rather than treating it as
// a first-discovery). The tracker is per-watcher-instance and per-entity-type;
// it is intentionally not persisted — restarting Maskor clears it, and the
// returning file is then treated as a first-discovery of an entity that happens
// to carry the original UUID (still identity-preserving, just without the flag).

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 1024;

type Entry = {
  expiresAt: number;
};

export type RecentlyDeletedTracker = {
  record(uuid: string): void;
  consume(uuid: string): boolean;
  size(): number;
};

export const createRecentlyDeletedTracker = (
  options: { ttlMs?: number; maxEntries?: number } = {},
): RecentlyDeletedTracker => {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const max = options.maxEntries ?? MAX_ENTRIES;
  const entries = new Map<string, Entry>();

  const evictExpired = () => {
    const now = Date.now();
    for (const [uuid, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(uuid);
    }
  };

  return {
    record(uuid) {
      evictExpired();
      if (entries.size >= max) {
        // Evict the oldest entry to make room — Map iteration order is insertion order.
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) entries.delete(oldestKey);
      }
      entries.set(uuid, { expiresAt: Date.now() + ttl });
    },

    consume(uuid) {
      const entry = entries.get(uuid);
      if (!entry) return false;
      entries.delete(uuid);
      if (entry.expiresAt <= Date.now()) return false;
      return true;
    },

    size() {
      evictExpired();
      return entries.size;
    },
  };
};
