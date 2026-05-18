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
  // Awaits in-flight handlers so they don't write after the caller proceeds.
  // Use during rebuild() to avoid the watcher/rebuild race condition.
  pause(): Promise<void>;
  resume(): void;
  // Push a synthetic event into the subscribed event bus. Used by the
  // storage service to broadcast `vault:restored` after a draft restore.
  emit(event: VaultSyncEvent): void;
};
