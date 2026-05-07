import { eq, inArray, sql } from "drizzle-orm";
import type { VaultDatabase } from "../db/vault";
import { fragmentStatsTable } from "../db/vault/schema";

export type FragmentStats = {
  fragmentUuid: string;
  voluntaryOpenCount: number;
  promptAcceptCount: number;
  avoidanceCount: number;
  editCount: number;
  lastSurfacedAt: Date | null;
};

// Row is created lazily on first stat increment.

const defaultStats = (fragmentUuid: string): FragmentStats => ({
  fragmentUuid,
  voluntaryOpenCount: 0,
  promptAcceptCount: 0,
  avoidanceCount: 0,
  editCount: 0,
  lastSurfacedAt: null,
});

export const getStats = (database: VaultDatabase, fragmentUuid: string): FragmentStats => {
  const row = database
    .select()
    .from(fragmentStatsTable)
    .where(eq(fragmentStatsTable.fragmentUuid, fragmentUuid))
    .get();
  return row ?? defaultStats(fragmentUuid);
};

export const getStatsBatch = (
  database: VaultDatabase,
  fragmentUuids: string[],
): Map<string, FragmentStats> => {
  const result = new Map<string, FragmentStats>();
  if (fragmentUuids.length === 0) return result;

  const rows = database
    .select()
    .from(fragmentStatsTable)
    .where(inArray(fragmentStatsTable.fragmentUuid, fragmentUuids))
    .all();

  for (const row of rows) {
    result.set(row.fragmentUuid, row);
  }

  return result;
};

export const incrementVoluntaryOpen = (database: VaultDatabase, fragmentUuid: string): void => {
  database
    .insert(fragmentStatsTable)
    .values({ fragmentUuid, voluntaryOpenCount: 1 })
    .onConflictDoUpdate({
      target: fragmentStatsTable.fragmentUuid,
      set: {
        voluntaryOpenCount: sql`${fragmentStatsTable.voluntaryOpenCount} + 1`,
      },
    })
    .run();
};

export const incrementPromptAccept = (
  database: VaultDatabase,
  fragmentUuid: string,
  surfacedAt: Date,
): void => {
  database
    .insert(fragmentStatsTable)
    .values({ fragmentUuid, promptAcceptCount: 1, lastSurfacedAt: surfacedAt })
    .onConflictDoUpdate({
      target: fragmentStatsTable.fragmentUuid,
      set: {
        promptAcceptCount: sql`${fragmentStatsTable.promptAcceptCount} + 1`,
        lastSurfacedAt: surfacedAt,
      },
    })
    .run();
};

export const incrementEdit = (database: VaultDatabase, fragmentUuid: string): void => {
  database
    .insert(fragmentStatsTable)
    .values({ fragmentUuid, editCount: 1 })
    .onConflictDoUpdate({
      target: fragmentStatsTable.fragmentUuid,
      set: {
        editCount: sql`${fragmentStatsTable.editCount} + 1`,
      },
    })
    .run();
};

export const incrementAvoidance = (database: VaultDatabase, fragmentUuid: string): void => {
  database
    .insert(fragmentStatsTable)
    .values({ fragmentUuid, avoidanceCount: 1 })
    .onConflictDoUpdate({
      target: fragmentStatsTable.fragmentUuid,
      set: {
        avoidanceCount: sql`${fragmentStatsTable.avoidanceCount} + 1`,
      },
    })
    .run();
};

