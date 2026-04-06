export { createVault, VaultError } from "./vault/markdown";
export type { Vault, VaultConfig } from "./vault/markdown";
export type { VaultErrorCode } from "./vault/types";

export { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "./db/registry";
export type { RegistryDatabase } from "./db/registry";

export { createProjectRegistry } from "./registry";
export type { ProjectRegistry, ProjectRecord, ProjectContext } from "./registry";
export { LOCAL_USER_UUID, ProjectNotFoundError } from "./registry";

export { createStorageService } from "./service";
export type { StorageService, StorageServiceConfig } from "./service";

export { createVaultDatabase } from "./db/vault";
export type { VaultDatabase } from "./db/vault";

export { createVaultIndexer } from "./indexer/indexer";
export type {
  VaultIndexer,
  IndexedFragment,
  IndexedFragmentProperty,
  IndexedAspect,
  IndexedNote,
  IndexedReference,
  RebuildStats,
  SyncWarning,
} from "./indexer/types";
