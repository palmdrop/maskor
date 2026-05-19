export { createVault, VaultError } from "./vault/markdown";
export type { Vault, VaultConfig } from "./vault/markdown";
export type { VaultErrorCode } from "./vault/types";

export { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "./db/registry";
export type { RegistryDatabase } from "./db/registry";

export { createProjectRegistry } from "./registry";
export type { ProjectRegistry, ProjectRecord, ProjectContext } from "./registry";
export { LOCAL_USER_UUID, ProjectNotFoundError, ProjectConflictError, VaultUUIDConflictError, ExistingVaultManifestError } from "./registry";

export { createStorageService } from "./service";
export type { StorageService, StorageServiceConfig } from "./service";

export { createVaultDatabase } from "./db/vault";
export type { VaultDatabase } from "./db/vault";

export { createVaultIndexer } from "./indexer/indexer";
export type {
  VaultIndexer,
  IndexedFragment,
  IndexedFragmentAspect,
  IndexedFragmentSummary,
  IndexedAspect,
  IndexedNote,
  IndexedReference,
  IndexedSequence,
  RebuildStats,
  SyncWarning,
} from "./indexer/types";

export { createVaultWatcher } from "./watcher";
export type { VaultWatcher } from "./watcher";

export type { FragmentStats, ProjectStats, FragmentStatsSummary } from "./suggestion/stats-repo";

export { readRecentEntries } from "./action-log";
export type { ActionLogWriter, ActionLogConfig } from "./action-log";

export { SWAP_ENTITY_TYPES, SwapEntityTypeError } from "./swap";
export type { SwapEntityType, SwapFile, SwapListEntry, SwapStorage } from "./swap";

export { createSettingsService } from "./settings";
export type { Settings, SettingsService, SettingsReadResult } from "./settings";

export { DraftError } from "./drafts";
export type { DraftErrorCode, ListedDraft } from "./drafts";
