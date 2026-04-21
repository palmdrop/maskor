import { and, eq, isNull } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { SQLiteBunTransaction } from "drizzle-orm/bun-sqlite";
import type { Aspect, Fragment, Note, Reference } from "@maskor/shared";
import {
  aspectNotesTable,
  aspectsTable,
  fragmentNotesTable,
  fragmentPropertiesTable,
  fragmentReferencesTable,
  fragmentsTable,
  notesTable,
  referencesTable,
} from "../db/vault/schema";
import type * as schema from "../db/vault/schema";
import type { VaultDatabase } from "../db/vault";
import type { SyncWarning } from "./types";
import { hashContent } from "../utils/hash";

// Loads the active (non-deleted) aspect key → UUID map from the DB at call time.
// Used by both the watcher and the storage service for fragment property resolution.
export const loadAspectKeyToUuid = (vaultDatabase: VaultDatabase): Map<string, string> => {
  const rows = vaultDatabase
    .select({ key: aspectsTable.key, uuid: aspectsTable.uuid })
    .from(aspectsTable)
    .where(isNull(aspectsTable.deletedAt))
    .all();
  return rows.reduce((map, row) => {
    map.set(row.key, row.uuid);
    return map;
  }, new Map<string, string>());
};

type Transaction = SQLiteBunTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

// All helpers are synchronous — bun:sqlite is sync and callers wrap in a sync
// transaction callback. Do not add async to these functions.

export const upsertAspect = (tx: Transaction, aspect: Aspect, filePath: string): void => {
  const syncedAt = new Date();

  tx.insert(aspectsTable)
    .values({
      uuid: aspect.uuid,
      key: aspect.key,
      category: aspect.category ?? null,
      filePath,
      deletedAt: null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: aspectsTable.uuid,
      set: {
        key: aspect.key,
        category: aspect.category ?? null,
        filePath,
        deletedAt: null,
        syncedAt,
      },
    })
    .run();

  tx.delete(aspectNotesTable).where(eq(aspectNotesTable.aspectUuid, aspect.uuid)).run();
  for (const noteTitle of aspect.notes) {
    tx.insert(aspectNotesTable).values({ aspectUuid: aspect.uuid, noteTitle }).run();
  }
};

export const upsertNote = (
  tx: Transaction,
  note: Note,
  filePath: string,
  rawContent: string,
): void => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  tx.insert(notesTable)
    .values({
      uuid: note.uuid,
      title: note.title,
      contentHash,
      filePath,
      deletedAt: null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: notesTable.uuid,
      set: { title: note.title, contentHash, filePath, deletedAt: null, syncedAt },
    })
    .run();
};

export const upsertReference = (
  tx: Transaction,
  reference: Reference,
  filePath: string,
  rawContent: string,
): void => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  tx.insert(referencesTable)
    .values({
      uuid: reference.uuid,
      name: reference.name,
      contentHash,
      filePath,
      deletedAt: null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: referencesTable.uuid,
      set: { name: reference.name, contentHash, filePath, deletedAt: null, syncedAt },
    })
    .run();
};

// Returns any SyncWarnings generated (only fragments can produce UNKNOWN_ASPECT_KEY).
// rawContent must be the full file string (frontmatter + body) so the stored hash covers
// the entire file — ensuring watcher hash-guards fire correctly on frontmatter-only edits.
export const upsertFragment = (
  tx: Transaction,
  fragment: Fragment,
  filePath: string,
  rawContent: string,
  aspectKeyToUuid: Map<string, string>,
): SyncWarning[] => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  const isDiscarded = filePath.startsWith("discarded/");

  tx.insert(fragmentsTable)
    .values({
      uuid: fragment.uuid,
      title: fragment.title,
      version: fragment.version,
      isDiscarded,
      readyStatus: fragment.readyStatus,
      contentHash,
      filePath,
      updatedAt: fragment.updatedAt,
      deletedAt: null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: fragmentsTable.uuid,
      set: {
        title: fragment.title,
        version: fragment.version,
        isDiscarded,
        readyStatus: fragment.readyStatus,
        contentHash,
        filePath,
        updatedAt: fragment.updatedAt,
        deletedAt: null,
        syncedAt,
      },
    })
    .run();

  tx.delete(fragmentNotesTable).where(eq(fragmentNotesTable.fragmentUuid, fragment.uuid)).run();
  for (const noteTitle of fragment.notes) {
    tx.insert(fragmentNotesTable).values({ fragmentUuid: fragment.uuid, noteTitle }).run();
  }

  tx.delete(fragmentReferencesTable)
    .where(eq(fragmentReferencesTable.fragmentUuid, fragment.uuid))
    .run();
  for (const referenceName of fragment.references) {
    tx.insert(fragmentReferencesTable).values({ fragmentUuid: fragment.uuid, referenceName }).run();
  }

  tx.delete(fragmentPropertiesTable)
    .where(eq(fragmentPropertiesTable.fragmentUuid, fragment.uuid))
    .run();

  const properties = Object.entries(fragment.properties);

  for (const [aspectKey, { weight }] of properties) {
    const resolvedUuid = aspectKeyToUuid.get(aspectKey) ?? null;
    tx.insert(fragmentPropertiesTable)
      .values({ fragmentUuid: fragment.uuid, aspectKey, aspectUuid: resolvedUuid, weight })
      .run();
  }

  return properties.reduce<SyncWarning[]>((acc, [aspectKey]) => {
    if (aspectKeyToUuid.has(aspectKey)) {
      return acc;
    }
    return [...acc, { kind: "UNKNOWN_ASPECT_KEY", aspectKey, fragmentUuids: [fragment.uuid] }];
  }, []);
};

// Soft-deletes a fragment by its entity-relative file path (e.g. "my-fragment.md" or
// "discarded/my-fragment.md"). No-op if no active row matches.
export const softDeleteFragmentByFilePath = (tx: Transaction, filePath: string): void => {
  tx.update(fragmentsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(fragmentsTable.filePath, filePath), isNull(fragmentsTable.deletedAt)))
    .run();
};

// Soft-deletes an aspect by its entity-relative file path (e.g. "my-aspect.md").
export const softDeleteAspectByFilePath = (tx: Transaction, filePath: string): void => {
  tx.update(aspectsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(aspectsTable.filePath, filePath), isNull(aspectsTable.deletedAt)))
    .run();
};

// Soft-deletes a note by its entity-relative file path (e.g. "my-note.md").
export const softDeleteNoteByFilePath = (tx: Transaction, filePath: string): void => {
  tx.update(notesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(notesTable.filePath, filePath), isNull(notesTable.deletedAt)))
    .run();
};

// Soft-deletes a reference by its entity-relative file path (e.g. "my-reference.md").
export const softDeleteReferenceByFilePath = (tx: Transaction, filePath: string): void => {
  tx.update(referencesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(referencesTable.filePath, filePath), isNull(referencesTable.deletedAt)))
    .run();
};
