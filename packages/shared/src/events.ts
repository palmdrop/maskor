export type VaultSyncEvent =
  | { type: "fragment:synced"; uuid: string }
  | { type: "fragment:deleted"; filePath: string }
  | { type: "aspect:synced"; uuid: string }
  | { type: "aspect:deleted"; filePath: string }
  | { type: "note:synced"; uuid: string }
  | { type: "note:deleted"; filePath: string }
  | { type: "reference:synced"; uuid: string }
  | { type: "reference:deleted"; filePath: string }
  | { type: "pieces:consumed"; count: number };

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
  "pieces:consumed",
] as const satisfies VaultSyncEvent["type"][];
