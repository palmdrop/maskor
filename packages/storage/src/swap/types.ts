import type { Logger } from "@maskor/shared/logger";
import type { SwapEntityType } from "./constants";

export type SwapFile = {
  content: string;
  savedAt: string;
  // A fingerprint of the server content the buffered edits diverged from (the "baseline"). Written by
  // the client so recovery can tell a single-tab crash (baseline still matches the current server) from
  // a stale multi-tab overwrite (the server advanced elsewhere since this swap was written). Optional:
  // legacy swaps written before this field keep the pre-baseline recovery behaviour. See
  // specifications/storage-sync.md (swap contract) and references/plans/multi-tab-swap-hardening.md.
  baseHash?: string;
};

export type SwapListEntry = {
  entityType: SwapEntityType;
  entityUUID: string;
  savedAt: string;
};

export type SwapStorageConfig = {
  vaultPath: string;
  logger?: Logger;
};

export type SwapStorage = {
  write(
    entityType: SwapEntityType,
    entityUUID: string,
    content: string,
    baseHash?: string,
  ): Promise<SwapFile>;
  read(entityType: SwapEntityType, entityUUID: string): Promise<SwapFile | null>;
  delete(entityType: SwapEntityType, entityUUID: string): Promise<void>;
  list(): Promise<SwapListEntry[]>;
};

export class SwapEntityTypeError extends Error {
  readonly code = "SWAP_UNKNOWN_ENTITY_TYPE" as const;
  readonly entityType: string;

  constructor(entityType: string) {
    super(`Unknown swap entity type: ${entityType}`);
    this.name = "SwapEntityTypeError";
    this.entityType = entityType;
  }
}
