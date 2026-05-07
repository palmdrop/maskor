import { eq } from "drizzle-orm";
import type { VaultDatabase } from "../../db/vault";
import { fragmentsTable } from "../../db/vault/schema";

// Checks whether a UUID already exists in the fragments table at a different file path.
// Returns the colliding entity-relative filePath if a collision exists, null otherwise.
export const findFragmentUuidCollision = (
  vaultDatabase: VaultDatabase,
  uuid: string,
  currentEntityRelativePath: string,
): string | null => {
  const row = vaultDatabase
    .select({ filePath: fragmentsTable.filePath })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.uuid, uuid))
    .get();

  if (!row || row.filePath === currentEntityRelativePath) return null;
  return row.filePath;
};
