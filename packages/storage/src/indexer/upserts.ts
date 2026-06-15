import { and, eq, not, or } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { SQLiteBunTransaction } from "drizzle-orm/bun-sqlite";
import type { Aspect, Fragment, Margin, Note, Reference, Sequence } from "@maskor/shared";
import {
  aspectNotesTable,
  aspectsTable,
  commentsTable,
  fragmentAspectsTable,
  fragmentPositionsTable,
  fragmentReferencesTable,
  fragmentStatsTable,
  fragmentsTable,
  marginsTable,
  notesTable,
  referencesTable,
  sectionsTable,
  sequencesTable,
} from "../db/vault/schema";
import type * as schema from "../db/vault/schema";
import type { VaultDatabase } from "../db/vault";
import type { UnknownAspectKeyWarning } from "./types";
import { hashContent } from "../utils/hash";

// Loads all aspect keys from the DB.
// Used for drift detection: a fragment property whose key is not in this set produces a SyncWarning.
export const loadKnownAspectKeys = (vaultDatabase: VaultDatabase): Set<string> => {
  const rows = vaultDatabase.select({ key: aspectsTable.key }).from(aspectsTable).all();
  return new Set(rows.map((row) => row.key));
};

export type Transaction = SQLiteBunTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// All helpers are synchronous — bun:sqlite is sync and callers wrap in a sync
// transaction callback. Do not add async to these functions.

export const upsertAspect = (
  tx: Transaction,
  aspect: Aspect,
  filePath: string,
  rawContent: string,
): void => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  // key and filePath are UNIQUE but not conflict targets — pre-delete any row that
  // would collide on either so the insert below doesn't throw a constraint error.
  tx.delete(aspectsTable)
    .where(
      and(
        not(eq(aspectsTable.uuid, aspect.uuid)),
        or(eq(aspectsTable.key, aspect.key), eq(aspectsTable.filePath, filePath)),
      ),
    )
    .run();

  tx.insert(aspectsTable)
    .values({
      uuid: aspect.uuid,
      key: aspect.key,
      color: aspect.color ?? null,
      contentHash,
      filePath,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: aspectsTable.uuid,
      set: {
        key: aspect.key,
        color: aspect.color ?? null,
        contentHash,
        filePath,
        syncedAt,
      },
    })
    .run();

  tx.delete(aspectNotesTable).where(eq(aspectNotesTable.aspectUuid, aspect.uuid)).run();
  for (const noteKey of aspect.notes) {
    tx.insert(aspectNotesTable).values({ aspectUuid: aspect.uuid, noteKey }).run();
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

  // key and filePath are UNIQUE but not conflict targets — pre-delete any row that
  // would collide on either so the insert below doesn't throw a constraint error.
  tx.delete(notesTable)
    .where(
      and(
        not(eq(notesTable.uuid, note.uuid)),
        or(eq(notesTable.key, note.key), eq(notesTable.filePath, filePath)),
      ),
    )
    .run();

  tx.insert(notesTable)
    .values({ uuid: note.uuid, key: note.key, contentHash, filePath, syncedAt })
    .onConflictDoUpdate({
      target: notesTable.uuid,
      set: { key: note.key, contentHash, filePath, syncedAt },
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

  // key and filePath are UNIQUE but not conflict targets — pre-delete any row that
  // would collide on either so the insert below doesn't throw a constraint error.
  tx.delete(referencesTable)
    .where(
      and(
        not(eq(referencesTable.uuid, reference.uuid)),
        or(eq(referencesTable.key, reference.key), eq(referencesTable.filePath, filePath)),
      ),
    )
    .run();

  tx.insert(referencesTable)
    .values({ uuid: reference.uuid, key: reference.key, contentHash, filePath, syncedAt })
    .onConflictDoUpdate({
      target: referencesTable.uuid,
      set: { key: reference.key, contentHash, filePath, syncedAt },
    })
    .run();
};

const buildExcerpt = (content: string, maxLength = 200): string => {
  const stripped = content
    .replace(/[#*_`[\]>]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return stripped.length > maxLength ? stripped.slice(0, maxLength) + "…" : stripped;
};

// Returns any SyncWarnings generated (only fragments can produce UNKNOWN_ASPECT_KEY).
// rawContent must be the full file string (frontmatter + body) so the stored hash covers
// the entire file — ensuring watcher hash-guards fire correctly on frontmatter-only edits.
export const upsertFragment = (
  tx: Transaction,
  fragment: Fragment,
  filePath: string,
  rawContent: string,
  knownAspectKeys: Set<string>,
): UnknownAspectKeyWarning[] => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  const isDiscarded = filePath.startsWith("discarded/");

  const excerpt = buildExcerpt(fragment.content);

  tx.insert(fragmentsTable)
    .values({
      uuid: fragment.uuid,
      key: fragment.key,
      isDiscarded,
      readiness: fragment.readiness,
      excerpt,
      contentHash,
      filePath,
      createdAt: fragment.createdAt,
      updatedAt: fragment.updatedAt,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: fragmentsTable.uuid,
      set: {
        key: fragment.key,
        isDiscarded,
        readiness: fragment.readiness,
        excerpt,
        contentHash,
        filePath,
        createdAt: fragment.createdAt,
        updatedAt: fragment.updatedAt,
        syncedAt,
      },
    })
    .run();

  tx.delete(fragmentReferencesTable)
    .where(eq(fragmentReferencesTable.fragmentUuid, fragment.uuid))
    .run();
  for (const referenceKey of fragment.references) {
    tx.insert(fragmentReferencesTable).values({ fragmentUuid: fragment.uuid, referenceKey }).run();
  }

  tx.delete(fragmentAspectsTable).where(eq(fragmentAspectsTable.fragmentUuid, fragment.uuid)).run();

  const aspectEntries = Object.entries(fragment.aspects);

  for (const [aspectKey, { weight }] of aspectEntries) {
    tx.insert(fragmentAspectsTable)
      .values({ fragmentUuid: fragment.uuid, aspectKey, weight })
      .run();
  }

  // Eager stats row creation — every fragment gets a row on first index/upsert.
  tx.insert(fragmentStatsTable).values({ fragmentUuid: fragment.uuid }).onConflictDoNothing().run();

  return aspectEntries.reduce<UnknownAspectKeyWarning[]>((acc, [aspectKey]) => {
    if (knownAspectKeys.has(aspectKey)) {
      return acc;
    }
    return [...acc, { kind: "UNKNOWN_ASPECT_KEY", aspectKey, fragmentUuids: [fragment.uuid] }];
  }, []);
};

export const deleteFragmentByFilePath = (tx: Transaction, filePath: string): void => {
  tx.delete(fragmentsTable).where(eq(fragmentsTable.filePath, filePath)).run();
};

export const deleteAspectByFilePath = (tx: Transaction, filePath: string): void => {
  tx.delete(aspectsTable).where(eq(aspectsTable.filePath, filePath)).run();
};

export const deleteNoteByFilePath = (tx: Transaction, filePath: string): void => {
  tx.delete(notesTable).where(eq(notesTable.filePath, filePath)).run();
};

export const deleteReferenceByFilePath = (tx: Transaction, filePath: string): void => {
  tx.delete(referencesTable).where(eq(referencesTable.filePath, filePath)).run();
};

export const upsertSequence = (
  tx: Transaction,
  sequence: Sequence,
  filePath: string,
  rawContent: string,
): void => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  // Pre-delete any row colliding on filePath with a different uuid.
  tx.delete(sequencesTable)
    .where(and(not(eq(sequencesTable.uuid, sequence.uuid)), eq(sequencesTable.filePath, filePath)))
    .run();

  // If this sequence is main, clear the main flag on all others in the same project
  // to preserve the one-main-per-project invariant.
  if (sequence.isMain) {
    tx.update(sequencesTable)
      .set({ isMain: false })
      .where(
        and(
          eq(sequencesTable.projectUuid, sequence.projectUuid),
          not(eq(sequencesTable.uuid, sequence.uuid)),
        ),
      )
      .run();
  }

  tx.insert(sequencesTable)
    .values({
      uuid: sequence.uuid,
      name: sequence.name,
      projectUuid: sequence.projectUuid,
      isMain: sequence.isMain,
      active: sequence.active,
      origin: sequence.origin ?? null,
      filePath,
      contentHash,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: sequencesTable.uuid,
      set: {
        name: sequence.name,
        projectUuid: sequence.projectUuid,
        isMain: sequence.isMain,
        active: sequence.active,
        origin: sequence.origin ?? null,
        filePath,
        contentHash,
        syncedAt,
      },
    })
    .run();

  // Replace sections and their fragment_positions (sections cascade-delete positions).
  tx.delete(sectionsTable).where(eq(sectionsTable.sequenceUuid, sequence.uuid)).run();

  sequence.sections.forEach((section, sectionIndex) => {
    tx.insert(sectionsTable)
      .values({
        uuid: section.uuid,
        name: section.name,
        sequenceUuid: sequence.uuid,
        position: sectionIndex,
      })
      .run();

    for (const fragmentPosition of section.fragments) {
      tx.insert(fragmentPositionsTable)
        .values({
          uuid: fragmentPosition.uuid,
          fragmentUuid: fragmentPosition.fragmentUuid,
          sectionUuid: section.uuid,
          position: fragmentPosition.position,
        })
        .run();
    }
  });
};

export const deleteSequenceByFilePath = (tx: Transaction, filePath: string): void => {
  tx.delete(sequencesTable).where(eq(sequencesTable.filePath, filePath)).run();
};

// Upsert a Margin and replace its comments. The vault file is authoritative; this row is the derived
// index. Orphan state is not stored — the panel derives it live from the open fragment buffer (a
// comment whose `<!--c:ID-->` marker is absent from the fragment is an orphan).
export const upsertMargin = (
  tx: Transaction,
  margin: Margin,
  filePath: string,
  rawContent: string,
): void => {
  const syncedAt = new Date();
  const contentHash = hashContent(rawContent);

  // filePath is UNIQUE but not the conflict target — pre-delete any row that would collide on it
  // under a different fragmentUuid (e.g. an external rename that swapped which fragment a stem maps
  // to). Comments cascade-delete with the margin row.
  tx.delete(marginsTable)
    .where(
      and(
        not(eq(marginsTable.fragmentUuid, margin.fragmentUuid)),
        eq(marginsTable.filePath, filePath),
      ),
    )
    .run();

  tx.insert(marginsTable)
    .values({
      fragmentUuid: margin.fragmentUuid,
      fragmentKey: margin.fragmentKey,
      notes: margin.notes,
      filePath,
      contentHash,
      createdAt: margin.createdAt,
      updatedAt: margin.updatedAt,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: marginsTable.fragmentUuid,
      set: {
        fragmentKey: margin.fragmentKey,
        notes: margin.notes,
        filePath,
        contentHash,
        createdAt: margin.createdAt,
        updatedAt: margin.updatedAt,
        syncedAt,
      },
    })
    .run();

  tx.delete(commentsTable).where(eq(commentsTable.fragmentUuid, margin.fragmentUuid)).run();
  margin.comments.forEach((comment, ordinal) => {
    tx.insert(commentsTable)
      .values({
        fragmentUuid: margin.fragmentUuid,
        markerId: comment.markerId,
        excerpt: comment.excerpt,
        body: comment.body,
        ordinal,
      })
      // The parser dedupes markerIds, but an API caller could still submit a duplicate; last-wins on
      // the `(fragmentUuid, markerId)` primary key keeps the insert from throwing.
      .onConflictDoUpdate({
        target: [commentsTable.fragmentUuid, commentsTable.markerId],
        set: {
          excerpt: comment.excerpt,
          body: comment.body,
          ordinal,
        },
      })
      .run();
  });
};

export const deleteMarginByFilePath = (tx: Transaction, filePath: string): void => {
  // Comments cascade-delete via the FK.
  tx.delete(marginsTable).where(eq(marginsTable.filePath, filePath)).run();
};

export const deleteMarginByFragmentUuid = (tx: Transaction, fragmentUuid: string): void => {
  // Comments cascade-delete via the FK.
  tx.delete(marginsTable).where(eq(marginsTable.fragmentUuid, fragmentUuid)).run();
};

// Reflect a fragment rename/discard/restore in the Margin index inline (matching how the fragment's
// own row is updated inline), so the index doesn't lag behind the moved file until the watcher
// catches up. No-op when the fragment has no Margin row. The file move is a pure relocation — content
// (and therefore contentHash) is unchanged — so only key + path move.
export const relocateMarginInIndex = (
  tx: Transaction,
  fragmentUuid: string,
  fragmentKey: string,
  filePath: string,
): void => {
  tx.update(marginsTable)
    .set({ fragmentKey, filePath })
    .where(eq(marginsTable.fragmentUuid, fragmentUuid))
    .run();
};

export const findAspectUuidsByNoteKey = (db: VaultDatabase, noteKey: string): string[] => {
  return db
    .select({ aspectUuid: aspectNotesTable.aspectUuid })
    .from(aspectNotesTable)
    .where(eq(aspectNotesTable.noteKey, noteKey))
    .all()
    .map((row) => row.aspectUuid);
};

export const findFragmentUuidsByReferenceKey = (
  db: VaultDatabase,
  referenceKey: string,
): string[] => {
  return db
    .select({ fragmentUuid: fragmentReferencesTable.fragmentUuid })
    .from(fragmentReferencesTable)
    .where(eq(fragmentReferencesTable.referenceKey, referenceKey))
    .all()
    .map((row) => row.fragmentUuid);
};

export const findFragmentUuidsByAspectKey = (db: VaultDatabase, aspectKey: string): string[] => {
  return db
    .select({ fragmentUuid: fragmentAspectsTable.fragmentUuid })
    .from(fragmentAspectsTable)
    .where(eq(fragmentAspectsTable.aspectKey, aspectKey))
    .all()
    .map((row) => row.fragmentUuid);
};
