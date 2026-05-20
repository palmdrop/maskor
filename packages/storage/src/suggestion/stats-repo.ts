import { eq, inArray, sql } from "drizzle-orm";
import type { VaultDatabase } from "../db/vault";
import { fragmentStatsTable, fragmentsTable } from "../db/vault/schema";

export type FragmentStats = {
  fragmentUuid: string;
  voluntaryOpenCount: number;
  promptAcceptCount: number;
  avoidanceCount: number;
  editCount: number;
  wordCount: number;
  lastSurfacedAt: Date | null;
};

export type FragmentStatsSummary = {
  fragmentUuid: string;
  key: string;
  wordCount: number;
  updatedAt: Date;
  readiness: number;
  isDiscarded: boolean;
};

export type ProjectStats = {
  global: {
    totalCount: number;
    discardedCount: number;
    readyCount: number;
    averageReadiness: number;
    readinessHistogram: [number, number, number, number, number];
    totalWordCount: number;
    averageWordCount: number;
  };
  fragments: FragmentStatsSummary[];
};

// Row is created eagerly on fragment insert (via upsertFragment in upserts.ts).
// Lazy writes (stat increments) use onConflictDoUpdate and will also create the row if missing.

const defaultStats = (fragmentUuid: string): FragmentStats => ({
  fragmentUuid,
  voluntaryOpenCount: 0,
  promptAcceptCount: 0,
  avoidanceCount: 0,
  editCount: 0,
  wordCount: 0,
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
  if (fragmentUuids.length === 0) {
    return result;
  }

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

export const getStatsForProject = (database: VaultDatabase): ProjectStats => {
  const fragments = database.select().from(fragmentsTable).all();

  const statsByUuid = getStatsBatch(
    database,
    fragments.map((fragment) => fragment.uuid),
  );

  const nonDiscarded = fragments.filter((fragment) => !fragment.isDiscarded);
  const discarded = fragments.filter((fragment) => fragment.isDiscarded);

  const readyCount = nonDiscarded.filter((fragment) => fragment.readiness === 1.0).length;

  const totalReadiness = nonDiscarded.reduce((acc, fragment) => acc + fragment.readiness, 0);
  const averageReadiness = nonDiscarded.length > 0 ? totalReadiness / nonDiscarded.length : 0;

  const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const fragment of nonDiscarded) {
    const status = fragment.readiness;
    if (status < 0.2) {
      histogram[0] += 1;
    } else if (status < 0.4) {
      histogram[1] += 1;
    } else if (status < 0.6) {
      histogram[2] += 1;
    } else if (status < 0.8) {
      histogram[3] += 1;
    } else {
      histogram[4] += 1;
    }
  }

  const totalWordCount = nonDiscarded.reduce((acc, fragment) => {
    const stats = statsByUuid.get(fragment.uuid);
    return acc + (stats?.wordCount ?? 0);
  }, 0);

  const averageWordCount = nonDiscarded.length > 0 ? totalWordCount / nonDiscarded.length : 0;

  const fragmentSummaries: FragmentStatsSummary[] = nonDiscarded
    .map((fragment) => {
      const stats = statsByUuid.get(fragment.uuid);
      return {
        fragmentUuid: fragment.uuid,
        key: fragment.key,
        wordCount: stats?.wordCount ?? 0,
        updatedAt: fragment.updatedAt,
        readiness: fragment.readiness,
        isDiscarded: fragment.isDiscarded,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    global: {
      totalCount: nonDiscarded.length,
      discardedCount: discarded.length,
      readyCount,
      averageReadiness,
      readinessHistogram: histogram,
      totalWordCount,
      averageWordCount,
    },
    fragments: fragmentSummaries,
  };
};

export const setWordCount = (
  database: VaultDatabase,
  fragmentUuid: string,
  wordCount: number,
): void => {
  database
    .insert(fragmentStatsTable)
    .values({ fragmentUuid, wordCount })
    .onConflictDoUpdate({
      target: fragmentStatsTable.fragmentUuid,
      set: { wordCount },
    })
    .run();
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
