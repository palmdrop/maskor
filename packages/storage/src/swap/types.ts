import type { Logger } from "@maskor/shared/logger";
import type { SwapEntityType } from "./constants";

export type SwapFile = {
  content: string;
  savedAt: string;
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
  write(entityType: SwapEntityType, entityUUID: string, content: string): Promise<SwapFile>;
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
