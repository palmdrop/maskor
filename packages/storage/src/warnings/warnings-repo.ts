import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { VaultDatabase } from "../db/vault";
import { vaultWarningsTable } from "../db/vault/schema";
import type { SyncWarning } from "../indexer/types";

// State warnings are re-detectable on rebuild and clear when the underlying cause is fixed.
// Event warnings are auto-resolved at detection time, persist until dismissed, and are never
// re-derived on rebuild.
export type WarningCategory = "state" | "event";
export type WarningKind = SyncWarning["kind"];

export type StoredWarning = SyncWarning & {
  id: string;
  category: WarningCategory;
  createdAt: Date;
  dismissedAt: Date | null;
};

export const STATE_WARNING_KINDS = [
  "WRONG_FORMAT_FILE",
  "UNKNOWN_ASPECT_KEY",
  "INVALID_ENTITY_FILE",
] as const satisfies WarningKind[];

const CATEGORY_BY_KIND: Record<WarningKind, WarningCategory> = {
  WRONG_FORMAT_FILE: "state",
  UNKNOWN_ASPECT_KEY: "state",
  INVALID_ENTITY_FILE: "state",
  UUID_COLLISION: "event",
};

// Natural per-key deduplication target for state warnings. Event warnings return null so
// the (kind, dedupKey) unique index never collides and every event yields a distinct row.
const dedupKeyFor = (warning: SyncWarning): string | null => {
  switch (warning.kind) {
    case "WRONG_FORMAT_FILE":
      return warning.filePath;
    case "UNKNOWN_ASPECT_KEY":
      return warning.aspectKey;
    case "INVALID_ENTITY_FILE":
      return warning.filePath;
    case "UUID_COLLISION":
      return null;
  }
};

const toStored = (row: typeof vaultWarningsTable.$inferSelect): StoredWarning => ({
  ...(row.payload as SyncWarning),
  id: row.id,
  category: row.category as WarningCategory,
  createdAt: row.createdAt,
  dismissedAt: row.dismissedAt,
});

// Insert a detected warning. State warnings upsert on (kind, dedupKey): a re-detection of the
// same cause refreshes the payload and createdAt rather than duplicating the row.
export const insertWarning = (vaultDatabase: VaultDatabase, warning: SyncWarning): void => {
  const category = CATEGORY_BY_KIND[warning.kind];
  const dedupKey = dedupKeyFor(warning);

  vaultDatabase
    .insert(vaultWarningsTable)
    .values({
      id: randomUUID(),
      kind: warning.kind,
      category,
      dedupKey,
      payload: warning,
      createdAt: new Date(),
      dismissedAt: null,
    })
    .onConflictDoUpdate({
      target: [vaultWarningsTable.kind, vaultWarningsTable.dedupKey],
      set: { payload: warning, createdAt: new Date(), dismissedAt: null },
    })
    .run();
};

// All non-dismissed warnings, oldest first.
export const listWarnings = (vaultDatabase: VaultDatabase): StoredWarning[] => {
  return vaultDatabase
    .select()
    .from(vaultWarningsTable)
    .where(isNull(vaultWarningsTable.dismissedAt))
    .orderBy(asc(vaultWarningsTable.createdAt))
    .all()
    .map(toStored);
};

// Wipe all state warnings of the given kinds. Called at the start of a rebuild before
// re-detection; event warnings are left untouched.
export const deleteStateWarnings = (
  vaultDatabase: VaultDatabase,
  kinds: readonly WarningKind[],
): void => {
  if (kinds.length === 0) return;
  vaultDatabase
    .delete(vaultWarningsTable)
    .where(inArray(vaultWarningsTable.kind, [...kinds]))
    .run();
};

// Remove a single state warning by its natural key — used when an incremental re-sync clears
// the cause (e.g. a wrong-format file is removed, or an unknown aspect key is resolved).
// Returns true if a row was actually removed.
export const deleteStateWarningByKey = (
  vaultDatabase: VaultDatabase,
  kind: WarningKind,
  dedupKey: string,
): boolean => {
  const removed = vaultDatabase
    .delete(vaultWarningsTable)
    .where(and(eq(vaultWarningsTable.kind, kind), eq(vaultWarningsTable.dedupKey, dedupKey)))
    .returning({ id: vaultWarningsTable.id })
    .all();
  return removed.length > 0;
};

export type DismissResult = "dismissed" | "not_found" | "not_event";

// Dismiss an event warning. State warnings cannot be dismissed (they clear by fixing the cause),
// so this is a no-op returning "not_event" for them.
export const dismissWarning = (vaultDatabase: VaultDatabase, id: string): DismissResult => {
  const row = vaultDatabase
    .select({ category: vaultWarningsTable.category })
    .from(vaultWarningsTable)
    .where(eq(vaultWarningsTable.id, id))
    .get();

  if (!row) return "not_found";
  if (row.category !== "event") return "not_event";

  vaultDatabase
    .update(vaultWarningsTable)
    .set({ dismissedAt: new Date() })
    .where(eq(vaultWarningsTable.id, id))
    .run();
  return "dismissed";
};
