export { createVault } from "./backend/markdown";
export type { Vault, VaultConfig, VaultError } from "./backend/markdown";

export { createRegistryDatabase, DEFAULT_CONFIG_DIRECTORY } from "./db";
export type { RegistryDatabase } from "./db";

export { createProjectRegistry } from "./registry";
export type { ProjectRegistry, ProjectRecord, ProjectContext } from "./registry";
export { LOCAL_USER_UUID, ProjectNotFoundError } from "./registry";

export { createStorageService } from "./service";
export type { StorageService, StorageServiceConfig } from "./service";

export { createVaultDatabase } from "./db/vault-db";
export type { VaultDatabase } from "./db/vault-db";

export { createVaultIndexer } from "./index/indexer";
export type {
  VaultIndexer,
  IndexedFragment,
  IndexedFragmentProperty,
  IndexedAspect,
  IndexedNote,
  IndexedReference,
  RebuildStats,
  SyncWarning,
} from "./index/types";
