import type { VaultSyncEvent } from "../../../shared/src";

export type CascadeCallbacks = {
  onNoteRename: (oldKey: string, newKey: string) => Promise<void>;
  onReferenceRename: (oldKey: string, newKey: string) => Promise<void>;
  onAspectRename: (oldKey: string, newKey: string) => Promise<void>;
};

export type VaultWatcher = {
  // Idempotent — calling start() when already running is a no-op.
  start(): void;
  // Safe to call before start(). Resolves immediately if never started.
  stop(): Promise<void>;
  // Pause event processing. Events that arrive while paused are dropped.
  // Use during rebuild() to avoid the watcher/rebuild race condition.
  pause(): void;
  resume(): void;
  // Subscribe to vault sync events. Returns an unsubscribe function.
  subscribe(callback: (event: VaultSyncEvent) => void): () => void;
};
