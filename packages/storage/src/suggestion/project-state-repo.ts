import { eq } from "drizzle-orm";
import type { VaultDatabase } from "../db/vault";
import { projectStateTable } from "../db/vault/schema";

export const getCurrentFragmentUUID = (database: VaultDatabase): string | null => {
  const row = database.select().from(projectStateTable).where(eq(projectStateTable.id, 1)).get();
  return row?.currentFragmentUUID ?? null;
};

export const setCurrentFragmentUUID = (
  database: VaultDatabase,
  uuid: string | null,
): void => {
  database
    .insert(projectStateTable)
    .values({ id: 1, currentFragmentUUID: uuid })
    .onConflictDoUpdate({
      target: projectStateTable.id,
      set: { currentFragmentUUID: uuid },
    })
    .run();
};
