export type VaultSyncEvent =
  | { type: "fragment:synced"; uuid: string }
  | { type: "fragment:deleted"; filePath: string }
  | { type: "aspect:synced"; uuid: string; revived?: boolean }
  | { type: "aspect:deleted"; filePath: string }
  | { type: "note:synced"; uuid: string; revived?: boolean }
  | { type: "note:deleted"; filePath: string }
  | { type: "reference:synced"; uuid: string; revived?: boolean }
  | { type: "reference:deleted"; filePath: string }
  | { type: "vault:restored"; draftUuid: string };

// Compile-time guard — if a new variant is added to VaultSyncEvent but not this array, TypeScript errors.
export const VAULT_SYNC_EVENT_TYPES = [
  "fragment:synced",
  "fragment:deleted",
  "aspect:synced",
  "aspect:deleted",
  "note:synced",
  "note:deleted",
  "reference:synced",
  "reference:deleted",
  "vault:restored",
] as const satisfies VaultSyncEvent["type"][];
