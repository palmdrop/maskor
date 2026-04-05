import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { AspectUUID, FragmentUUID, NoteUUID, Pool, ReferenceUUID } from "@maskor/shared";
import type { VaultDatabase } from "../db/vault";
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
import type { Vault } from "../vault/types";
import type {
  IndexedAspect,
  IndexedFragment,
  RebuildStats,
  SyncWarning,
  VaultIndexer,
} from "./types";
import { hashContent } from "../utils/hash";
import { assembleAspect, assembleFragment } from "./assemblers";

// --- indexer factory ---

export const createVaultIndexer = (vaultDatabase: VaultDatabase, vault: Vault): VaultIndexer => {
  // --- rebuild ---

  const rebuild = async (): Promise<RebuildStats> => {
    const startTime = performance.now();

    // Phase 1: Read all vault data (async).
    // TODO: This loads all vault entities into memory before writing. For very large vaults
    // this may become a concern. Consider chunked writes if needed (see suggestions.md).
    const [aspectEntries, noteEntries, referenceEntries, fragmentEntries] = await Promise.all([
      vault.aspects.readAllWithFilePaths(),
      vault.notes.readAllWithFilePaths(),
      vault.references.readAllWithFilePaths(),
      vault.fragments.readAllWithFilePaths(),
    ]);

    // Build aspect key → UUID resolution map (used when indexing fragment properties).
    const aspectKeyToUuid = new Map<string, AspectUUID>();
    for (const { entity: aspect } of aspectEntries) {
      aspectKeyToUuid.set(aspect.key, aspect.uuid);
    }

    // Collect unresolved aspect keys before entering the transaction.
    const unresolvedKeys = new Map<string, Set<FragmentUUID>>();
    for (const { entity: fragment } of fragmentEntries) {
      for (const aspectKey of Object.keys(fragment.properties)) {
        if (!aspectKeyToUuid.has(aspectKey)) {
          if (!unresolvedKeys.has(aspectKey)) {
            unresolvedKeys.set(aspectKey, new Set());
          }
          unresolvedKeys.get(aspectKey)!.add(fragment.uuid);
        }
      }
    }

    // Phase 2: Write all data in a single transaction (sync).
    // A single transaction ensures the DB is never left in a partially-updated state if
    // rebuild is interrupted. It also batches all fsyncs for a significant performance win.
    const syncedAt = new Date();

    vaultDatabase.transaction((tx) => {
      // 1. Upsert aspects.
      for (const { entity: aspect, filePath } of aspectEntries) {
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
      }

      // Soft-delete aspects absent from vault.
      const activeAspectUuids = aspectEntries.map(({ entity }) => entity.uuid as string);
      if (activeAspectUuids.length > 0) {
        tx.update(aspectsTable)
          .set({ deletedAt: syncedAt })
          .where(
            and(isNull(aspectsTable.deletedAt), notInArray(aspectsTable.uuid, activeAspectUuids)),
          )
          .run();
      } else {
        tx.update(aspectsTable)
          .set({ deletedAt: syncedAt })
          .where(isNull(aspectsTable.deletedAt))
          .run();
      }

      // 2. Upsert notes.
      for (const { entity: note, filePath } of noteEntries) {
        const contentHash = hashContent(note.content);
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
      }

      const activeNoteUuids = noteEntries.map(({ entity }) => entity.uuid as string);
      if (activeNoteUuids.length > 0) {
        tx.update(notesTable)
          .set({ deletedAt: syncedAt })
          .where(and(isNull(notesTable.deletedAt), notInArray(notesTable.uuid, activeNoteUuids)))
          .run();
      } else {
        tx.update(notesTable)
          .set({ deletedAt: syncedAt })
          .where(isNull(notesTable.deletedAt))
          .run();
      }

      // 3. Upsert references.
      for (const { entity: reference, filePath } of referenceEntries) {
        const contentHash = hashContent(reference.content);
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
      }

      const activeReferenceUuids = referenceEntries.map(({ entity }) => entity.uuid as string);
      if (activeReferenceUuids.length > 0) {
        tx.update(referencesTable)
          .set({ deletedAt: syncedAt })
          .where(
            and(
              isNull(referencesTable.deletedAt),
              notInArray(referencesTable.uuid, activeReferenceUuids),
            ),
          )
          .run();
      } else {
        tx.update(referencesTable)
          .set({ deletedAt: syncedAt })
          .where(isNull(referencesTable.deletedAt))
          .run();
      }

      // 4. Upsert fragments last — aspect resolution map is ready.
      for (const { entity: fragment, filePath } of fragmentEntries) {
        const contentHash = hashContent(fragment.content);
        tx.insert(fragmentsTable)
          .values({
            uuid: fragment.uuid,
            title: fragment.title,
            version: fragment.version,
            pool: fragment.pool,
            readyStatus: fragment.readyStatus,
            contentHash,
            filePath,
            deletedAt: null,
            syncedAt,
          })
          .onConflictDoUpdate({
            target: fragmentsTable.uuid,
            set: {
              title: fragment.title,
              version: fragment.version,
              pool: fragment.pool,
              readyStatus: fragment.readyStatus,
              contentHash,
              filePath,
              deletedAt: null,
              syncedAt,
            },
          })
          .run();

        tx.delete(fragmentNotesTable)
          .where(eq(fragmentNotesTable.fragmentUuid, fragment.uuid))
          .run();
        for (const noteTitle of fragment.notes) {
          tx.insert(fragmentNotesTable).values({ fragmentUuid: fragment.uuid, noteTitle }).run();
        }

        tx.delete(fragmentReferencesTable)
          .where(eq(fragmentReferencesTable.fragmentUuid, fragment.uuid))
          .run();
        for (const referenceName of fragment.references) {
          tx.insert(fragmentReferencesTable)
            .values({ fragmentUuid: fragment.uuid, referenceName })
            .run();
        }

        tx.delete(fragmentPropertiesTable)
          .where(eq(fragmentPropertiesTable.fragmentUuid, fragment.uuid))
          .run();
        for (const [aspectKey, { weight }] of Object.entries(fragment.properties)) {
          const resolvedUuid = aspectKeyToUuid.get(aspectKey) ?? null;
          tx.insert(fragmentPropertiesTable)
            .values({ fragmentUuid: fragment.uuid, aspectKey, aspectUuid: resolvedUuid, weight })
            .run();
        }
      }

      // Soft-delete fragments absent from vault.
      const activeFragmentUuids = fragmentEntries.map(({ entity }) => entity.uuid as string);
      if (activeFragmentUuids.length) {
        tx.update(fragmentsTable)
          .set({ deletedAt: syncedAt })
          .where(
            and(
              isNull(fragmentsTable.deletedAt),
              notInArray(fragmentsTable.uuid, activeFragmentUuids),
            ),
          )
          .run();
      } else {
        tx.update(fragmentsTable)
          .set({ deletedAt: syncedAt })
          .where(isNull(fragmentsTable.deletedAt))
          .run();
      }
    });

    // 5. Emit one warning per unresolved aspect key.
    const warnings: SyncWarning[] = [];
    for (const [aspectKey, uuidSet] of unresolvedKeys.entries()) {
      warnings.push({
        kind: "UNKNOWN_ASPECT_KEY",
        aspectKey,
        fragmentUuids: Array.from(uuidSet),
      });
    }

    return {
      fragments: fragmentEntries.length,
      aspects: aspectEntries.length,
      notes: noteEntries.length,
      references: referenceEntries.length,
      durationMs: performance.now() - startTime,
      warnings,
    };
  };

  // --- query helpers ---

  // These helpers are synchronous (bun:sqlite is sync) but typed as async to satisfy
  // the VaultIndexer interface contract. TODO: revisit if the interface is ever changed
  // to allow sync return types.
  const loadFragmentRelations = async (
    fragmentRows: Array<typeof fragmentsTable.$inferSelect>,
  ): Promise<IndexedFragment[]> => {
    if (fragmentRows.length === 0) return [];

    const uuids = fragmentRows.map((row) => row.uuid);

    const allNotes = vaultDatabase
      .select()
      .from(fragmentNotesTable)
      .where(inArray(fragmentNotesTable.fragmentUuid, uuids))
      .all();

    const allReferences = vaultDatabase
      .select()
      .from(fragmentReferencesTable)
      .where(inArray(fragmentReferencesTable.fragmentUuid, uuids))
      .all();

    const allProperties = vaultDatabase
      .select()
      .from(fragmentPropertiesTable)
      .where(inArray(fragmentPropertiesTable.fragmentUuid, uuids))
      .all();

    return fragmentRows.map((row) =>
      assembleFragment(
        row,
        allNotes.filter((note) => note.fragmentUuid === row.uuid),
        allReferences.filter((reference) => reference.fragmentUuid === row.uuid),
        allProperties.filter((property) => property.fragmentUuid === row.uuid),
      ),
    );
  };

  const loadAspectRelations = async (
    aspectRows: Array<typeof aspectsTable.$inferSelect>,
  ): Promise<IndexedAspect[]> => {
    if (aspectRows.length === 0) return [];

    const uuids = aspectRows.map((row) => row.uuid);

    const allNotes = vaultDatabase
      .select()
      .from(aspectNotesTable)
      .where(inArray(aspectNotesTable.aspectUuid, uuids))
      .all();

    return aspectRows.map((row) =>
      assembleAspect(
        row,
        allNotes.filter((note) => note.aspectUuid === row.uuid),
      ),
    );
  };

  // --- public interface ---

  return {
    rebuild,

    fragments: {
      async findAll() {
        const rows = vaultDatabase
          .select()
          .from(fragmentsTable)
          .where(isNull(fragmentsTable.deletedAt))
          .all();
        return loadFragmentRelations(rows);
      },

      async findByUUID(uuid: FragmentUUID) {
        const row = vaultDatabase
          .select()
          .from(fragmentsTable)
          .where(eq(fragmentsTable.uuid, uuid))
          .get();

        if (!row || row.deletedAt !== null) return null;

        const results = await loadFragmentRelations([row]);
        return results[0] ?? null;
      },

      async findByPool(pool: Pool) {
        const rows = vaultDatabase
          .select()
          .from(fragmentsTable)
          .where(and(eq(fragmentsTable.pool, pool), isNull(fragmentsTable.deletedAt)))
          .all();
        return loadFragmentRelations(rows);
      },

      async findFilePath(uuid: FragmentUUID) {
        const row = vaultDatabase
          .select({ filePath: fragmentsTable.filePath, deletedAt: fragmentsTable.deletedAt })
          .from(fragmentsTable)
          .where(eq(fragmentsTable.uuid, uuid))
          .get();

        if (!row || row.deletedAt !== null) return null;
        return row.filePath;
      },
    },

    aspects: {
      async findAll() {
        const rows = vaultDatabase
          .select()
          .from(aspectsTable)
          .where(isNull(aspectsTable.deletedAt))
          .all();
        return loadAspectRelations(rows);
      },

      async findByKey(key: string) {
        const row = vaultDatabase
          .select()
          .from(aspectsTable)
          .where(eq(aspectsTable.key, key))
          .get();

        if (!row || row.deletedAt !== null) return null;

        const results = await loadAspectRelations([row]);
        return results[0] ?? null;
      },

      async findByUUID(uuid: AspectUUID) {
        const row = vaultDatabase
          .select()
          .from(aspectsTable)
          .where(eq(aspectsTable.uuid, uuid))
          .get();

        if (!row || row.deletedAt !== null) return null;

        const results = await loadAspectRelations([row]);
        return results[0] ?? null;
      },
    },

    notes: {
      async findAll() {
        return vaultDatabase
          .select()
          .from(notesTable)
          .where(isNull(notesTable.deletedAt))
          .all()
          .map((row) => ({
            uuid: row.uuid as NoteUUID,
            title: row.title,
            filePath: row.filePath,
          }));
      },

      async findByTitle(title: string) {
        const row = vaultDatabase
          .select()
          .from(notesTable)
          .where(eq(notesTable.title, title))
          .get();

        if (!row || row.deletedAt !== null) return null;
        return { uuid: row.uuid as NoteUUID, title: row.title, filePath: row.filePath };
      },

      async findByUUID(uuid: NoteUUID) {
        const row = vaultDatabase.select().from(notesTable).where(eq(notesTable.uuid, uuid)).get();

        if (!row || row.deletedAt !== null) return null;
        return { uuid: row.uuid as NoteUUID, title: row.title, filePath: row.filePath };
      },
    },

    references: {
      async findAll() {
        return vaultDatabase
          .select()
          .from(referencesTable)
          .where(isNull(referencesTable.deletedAt))
          .all()
          .map((row) => ({
            uuid: row.uuid as ReferenceUUID,
            name: row.name,
            filePath: row.filePath,
          }));
      },

      async findByName(name: string) {
        const row = vaultDatabase
          .select()
          .from(referencesTable)
          .where(eq(referencesTable.name, name))
          .get();

        if (!row || row.deletedAt !== null) return null;
        return { uuid: row.uuid as ReferenceUUID, name: row.name, filePath: row.filePath };
      },

      async findByUUID(uuid: ReferenceUUID) {
        const row = vaultDatabase
          .select()
          .from(referencesTable)
          .where(eq(referencesTable.uuid, uuid))
          .get();

        if (!row || row.deletedAt !== null) return null;
        return { uuid: row.uuid as ReferenceUUID, name: row.name, filePath: row.filePath };
      },
    },
  };
};
