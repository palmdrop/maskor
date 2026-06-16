import { eq, inArray, notInArray } from "drizzle-orm";
import type { VaultDatabase } from "../db/vault";
import {
  aspectNotesTable,
  aspectsTable,
  commentsTable,
  fragmentAspectsTable,
  fragmentPositionsTable,
  fragmentReferencesTable,
  fragmentsTable,
  linksTable,
  marginsTable,
  notesTable,
  referencesTable,
  sectionsTable,
  sequencesTable,
} from "../db/vault/schema";
import type { EntityReadFailure, Vault } from "../vault/types";
import type {
  EntityKind,
  IndexedAspect,
  IndexedFragment,
  IndexedMargin,
  IndexedSequence,
  RebuildStats,
  SyncWarning,
  UnknownAspectKeyWarning,
  VaultIndexer,
} from "./types";
import {
  assembleAspect,
  assembleFragment,
  assembleMargin,
  assembleNote,
  assembleReference,
  assembleSequence,
} from "./assemblers";
import {
  upsertAspect,
  upsertFragment,
  upsertMargin,
  upsertNote,
  upsertReference,
  upsertSequence,
} from "./upserts";
import { findBacklinks, findOutgoingLinks, resolveAllLinks } from "./links";
import type { BacklinkRow, LinkSourceType, OutgoingLinkRow } from "./links";
import type { LinkEntityKind } from "@maskor/shared";
import { setWordCount } from "../suggestion/stats-repo";
import { computeWordCount } from "../suggestion/word-count";
import { deleteStateWarnings, insertWarning, STATE_WARNING_KINDS } from "../warnings/warnings-repo";
import { detectWrongFormatFiles } from "../warnings/wrong-format";

// Multiple fragments may reference the same unknown aspect key. Collapse the per-fragment
// warnings into one row per key, merging the affected fragment UUIDs.
const aggregateUnknownAspectWarnings = (
  warnings: UnknownAspectKeyWarning[],
): UnknownAspectKeyWarning[] => {
  const fragmentUuidsByKey = new Map<string, Set<string>>();
  for (const warning of warnings) {
    const existing = fragmentUuidsByKey.get(warning.aspectKey) ?? new Set<string>();
    for (const uuid of warning.fragmentUuids) existing.add(uuid);
    fragmentUuidsByKey.set(warning.aspectKey, existing);
  }
  return [...fragmentUuidsByKey].map(([aspectKey, uuids]) => ({
    kind: "UNKNOWN_ASPECT_KEY",
    aspectKey,
    fragmentUuids: [...uuids],
  }));
};

// Entity-directory prefix per kind, used to turn an entity-relative failure path into the
// vault-root-relative path the warnings store keys on (matching WRONG_FORMAT_FILE).
const ENTITY_FOLDER_BY_KIND: Record<EntityKind, string> = {
  fragment: "fragments",
  aspect: "aspects",
  note: "notes",
  reference: "references",
  sequence: ".maskor/sequences",
  margin: "margins",
};

// Turn the fault-tolerant read failures for one entity kind into INVALID_ENTITY_FILE warnings.
// A file that failed to parse is reported, never rewritten — the user fixes it and the warning
// clears on the next rebuild.
const invalidFileWarnings = (
  entityKind: EntityKind,
  failures: EntityReadFailure[],
): SyncWarning[] =>
  failures.map((failure) => ({
    kind: "INVALID_ENTITY_FILE",
    filePath: `${ENTITY_FOLDER_BY_KIND[entityKind]}/${failure.filePath}`,
    entityKind,
    error: failure.error,
  }));

// --- indexer factory ---

export const createVaultIndexer = (vaultDatabase: VaultDatabase, vault: Vault): VaultIndexer => {
  // --- rebuild ---

  const rebuild = async (): Promise<RebuildStats> => {
    const startTime = performance.now();

    // Phase 1: Read all vault data (async).
    // TODO: This loads all vault entities into memory before writing. For very large vaults
    // this may become a concern. Consider chunked writes if needed (see suggestions.md).
    const [
      aspectResult,
      noteResult,
      referenceResult,
      fragmentResult,
      sequenceResult,
      marginResult,
    ] = await Promise.all([
      // adopt: mint + write back UUIDs for any entity file lacking one. The watcher ignores the
      // initial scan, so rebuild is the only path that canonicalizes pre-existing files.
      // Sequences are Maskor-owned and always carry a UUID, so they are read without adoption.
      vault.aspects.readAllWithFilePaths({ adopt: true }),
      vault.notes.readAllWithFilePaths({ adopt: true }),
      vault.references.readAllWithFilePaths({ adopt: true }),
      vault.fragments.readAllWithFilePaths({ adopt: true }),
      vault.sequences.readAllWithFilePaths(),
      // Margins carry no UUID of their own (joined by fragmentUuid) — read without adoption.
      vault.margins.readAllWithFilePaths(),
    ]);

    // Successfully parsed entities flow into the index; per-file failures become
    // INVALID_ENTITY_FILE warnings below. One bad file no longer wedges the whole rebuild.
    const aspectEntries = aspectResult.entities;
    const noteEntries = noteResult.entities;
    const referenceEntries = referenceResult.entities;
    const fragmentEntries = fragmentResult.entities;
    const sequenceEntries = sequenceResult.entities;
    const marginEntries = marginResult.entities;

    // Build known aspect key set (used for drift detection during the fragments pass).
    const knownAspectKeys = new Set(aspectEntries.map(({ entity: aspect }) => aspect.key));

    // Phase 2: Write all data in a single transaction (sync).
    // A single transaction ensures the DB is never left in a partially-updated state if
    // rebuild is interrupted. It also batches all fsyncs for a significant performance win.
    const fragmentWarnings: UnknownAspectKeyWarning[] = [];

    vaultDatabase.transaction((tx) => {
      // Clear the link index up front: each entity upsert re-populates its own outgoing links via
      // syncLinks, but a source that vanished from the vault would otherwise leave stale rows behind.
      tx.delete(linksTable).run();

      // 1. Upsert aspects.
      for (const { entity: aspect, filePath, rawContent } of aspectEntries) {
        upsertAspect(tx, aspect, filePath, rawContent);
      }

      // Hard-delete aspects absent from vault.
      const activeAspectUuids = aspectEntries.map(({ entity }) => entity.uuid as string);
      if (activeAspectUuids.length > 0) {
        tx.delete(aspectsTable).where(notInArray(aspectsTable.uuid, activeAspectUuids)).run();
      } else {
        tx.delete(aspectsTable).run();
      }

      // 2. Upsert notes.
      for (const { entity: note, filePath, rawContent } of noteEntries) {
        upsertNote(tx, note, filePath, rawContent);
      }

      const activeNoteUuids = noteEntries.map(({ entity }) => entity.uuid as string);
      if (activeNoteUuids.length > 0) {
        tx.delete(notesTable).where(notInArray(notesTable.uuid, activeNoteUuids)).run();
      } else {
        tx.delete(notesTable).run();
      }

      // 3. Upsert references.
      for (const { entity: reference, filePath, rawContent } of referenceEntries) {
        upsertReference(tx, reference, filePath, rawContent);
      }

      const activeReferenceUuids = referenceEntries.map(({ entity }) => entity.uuid as string);
      if (activeReferenceUuids.length > 0) {
        tx.delete(referencesTable)
          .where(notInArray(referencesTable.uuid, activeReferenceUuids))
          .run();
      } else {
        tx.delete(referencesTable).run();
      }

      // 4. Upsert fragments last — known aspect key set is ready for drift detection.
      for (const { entity: fragment, filePath, rawContent } of fragmentEntries) {
        const warnings = upsertFragment(tx, fragment, filePath, rawContent, knownAspectKeys);
        fragmentWarnings.push(...warnings);
      }

      // Hard-delete fragments absent from vault.
      const activeFragmentUuids = fragmentEntries.map(({ entity }) => entity.uuid as string);
      if (activeFragmentUuids.length) {
        tx.delete(fragmentsTable).where(notInArray(fragmentsTable.uuid, activeFragmentUuids)).run();
      } else {
        tx.delete(fragmentsTable).run();
      }

      // 5. Upsert sequences (sections and fragment_positions cascade from each upsert).
      for (const { entity: sequence, filePath, rawContent } of sequenceEntries) {
        upsertSequence(tx, sequence, filePath, rawContent);
      }

      const activeSequenceUuids = sequenceEntries.map(({ entity }) => entity.uuid as string);
      if (activeSequenceUuids.length > 0) {
        tx.delete(sequencesTable).where(notInArray(sequencesTable.uuid, activeSequenceUuids)).run();
      } else {
        tx.delete(sequencesTable).run();
      }

      // 6. Upsert margins (comments cascade from each upsert). Orphan state is not stored — the panel
      // derives it live from the open fragment buffer.
      for (const { entity: margin, filePath, rawContent } of marginEntries) {
        upsertMargin(tx, margin, filePath, rawContent);
      }

      const activeMarginUuids = marginEntries.map(({ entity }) => entity.fragmentUuid);
      if (activeMarginUuids.length > 0) {
        tx.delete(marginsTable)
          .where(notInArray(marginsTable.fragmentUuid, activeMarginUuids))
          .run();
      } else {
        tx.delete(marginsTable).run();
      }

      // 7. Resolve links: every entity is now indexed, so a link authored before its target was
      // upserted (e.g. a note → fragment link, with notes upserted before fragments) can now bind.
      resolveAllLinks(tx);
    });

    // Backfill word counts for all fragments. Runs outside the main transaction because
    // fragment_stats is intentionally not co-transacted with vault entity writes.
    // Idempotent: overwrites any existing value with the recomputed one.
    for (const { entity: fragment } of fragmentEntries) {
      setWordCount(vaultDatabase, fragment.uuid as string, computeWordCount(fragment.content));
    }

    // Refresh state warnings: wipe the re-detectable kinds, then re-insert from this rebuild.
    // Event warnings (UUID_COLLISION) are deliberately preserved — they are never re-derived.
    deleteStateWarnings(vaultDatabase, STATE_WARNING_KINDS);
    for (const warning of detectWrongFormatFiles(vault.root)) {
      insertWarning(vaultDatabase, warning);
    }
    for (const warning of aggregateUnknownAspectWarnings(fragmentWarnings)) {
      insertWarning(vaultDatabase, warning);
    }
    const invalidEntityWarnings = [
      ...invalidFileWarnings("fragment", fragmentResult.failures),
      ...invalidFileWarnings("aspect", aspectResult.failures),
      ...invalidFileWarnings("note", noteResult.failures),
      ...invalidFileWarnings("reference", referenceResult.failures),
      ...invalidFileWarnings("sequence", sequenceResult.failures),
      ...invalidFileWarnings("margin", marginResult.failures),
    ];
    for (const warning of invalidEntityWarnings) {
      insertWarning(vaultDatabase, warning);
    }

    return {
      fragments: fragmentEntries.length,
      aspects: aspectEntries.length,
      notes: noteEntries.length,
      references: referenceEntries.length,
      sequences: sequenceEntries.length,
      durationMs: performance.now() - startTime,
      warnings: fragmentWarnings,
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

    const allReferences = vaultDatabase
      .select()
      .from(fragmentReferencesTable)
      .where(inArray(fragmentReferencesTable.fragmentUuid, uuids))
      .all();

    const allProperties = vaultDatabase
      .select()
      .from(fragmentAspectsTable)
      .where(inArray(fragmentAspectsTable.fragmentUuid, uuids))
      .all();

    return fragmentRows.map((row) =>
      assembleFragment(
        row,
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

  const loadSequenceRelations = async (
    sequenceRows: Array<typeof sequencesTable.$inferSelect>,
  ): Promise<IndexedSequence[]> => {
    if (sequenceRows.length === 0) return [];

    const uuids = sequenceRows.map((row) => row.uuid);

    const allSections = vaultDatabase
      .select()
      .from(sectionsTable)
      .where(inArray(sectionsTable.sequenceUuid, uuids))
      .all();

    const sectionUuids = allSections.map((section) => section.uuid);
    const allFragmentPositions =
      sectionUuids.length > 0
        ? vaultDatabase
            .select()
            .from(fragmentPositionsTable)
            .where(inArray(fragmentPositionsTable.sectionUuid, sectionUuids))
            .all()
        : [];

    return sequenceRows.map((row) =>
      assembleSequence(
        row,
        allSections.filter((section) => section.sequenceUuid === row.uuid),
        allFragmentPositions,
      ),
    );
  };

  // --- public interface ---

  return {
    rebuild,

    fragments: {
      async findAll() {
        const rows = vaultDatabase.select().from(fragmentsTable).all();
        return loadFragmentRelations(rows);
      },

      async findAllSummaries() {
        const fragmentRows = vaultDatabase
          .select({
            uuid: fragmentsTable.uuid,
            key: fragmentsTable.key,
            isDiscarded: fragmentsTable.isDiscarded,
            excerpt: fragmentsTable.excerpt,
          })
          .from(fragmentsTable)
          .all();

        const aspectWeightRows = vaultDatabase
          .select({
            fragmentUuid: fragmentAspectsTable.fragmentUuid,
            aspectKey: fragmentAspectsTable.aspectKey,
            weight: fragmentAspectsTable.weight,
          })
          .from(fragmentAspectsTable)
          .all();

        const aspectsByFragmentUuid = aspectWeightRows.reduce((acc, row) => {
          const existing = acc.get(row.fragmentUuid) ?? {};
          existing[row.aspectKey] = { weight: row.weight };
          acc.set(row.fragmentUuid, existing);
          return acc;
        }, new Map<string, Record<string, { weight: number }>>());

        return fragmentRows.map((row) => ({
          ...row,
          aspects: aspectsByFragmentUuid.get(row.uuid) ?? {},
        }));
      },

      async findByUUID(uuid: string) {
        const row = vaultDatabase
          .select()
          .from(fragmentsTable)
          .where(eq(fragmentsTable.uuid, uuid))
          .get();

        if (!row) return null;

        const results = await loadFragmentRelations([row]);
        return results[0] ?? null;
      },

      async findFilePath(uuid: string) {
        const row = vaultDatabase
          .select({ filePath: fragmentsTable.filePath })
          .from(fragmentsTable)
          .where(eq(fragmentsTable.uuid, uuid))
          .get();

        if (!row) return null;
        return row.filePath;
      },
    },

    aspects: {
      async findAll() {
        const rows = vaultDatabase.select().from(aspectsTable).all();
        return loadAspectRelations(rows);
      },

      async findByKey(key: string) {
        const row = vaultDatabase
          .select()
          .from(aspectsTable)
          .where(eq(aspectsTable.key, key))
          .get();

        if (!row) return null;

        const results = await loadAspectRelations([row]);
        return results[0] ?? null;
      },

      async findByUUID(uuid: string) {
        const row = vaultDatabase
          .select()
          .from(aspectsTable)
          .where(eq(aspectsTable.uuid, uuid))
          .get();

        if (!row) return null;

        const results = await loadAspectRelations([row]);
        return results[0] ?? null;
      },
    },

    notes: {
      async findAll() {
        return vaultDatabase.select().from(notesTable).all().map(assembleNote);
      },

      async findByKey(key: string) {
        const row = vaultDatabase.select().from(notesTable).where(eq(notesTable.key, key)).get();
        return row ? assembleNote(row) : null;
      },

      async findByUUID(uuid: string) {
        const row = vaultDatabase.select().from(notesTable).where(eq(notesTable.uuid, uuid)).get();
        return row ? assembleNote(row) : null;
      },
    },

    references: {
      async findAll() {
        return vaultDatabase.select().from(referencesTable).all().map(assembleReference);
      },

      async findByKey(key: string) {
        const row = vaultDatabase
          .select()
          .from(referencesTable)
          .where(eq(referencesTable.key, key))
          .get();
        return row ? assembleReference(row) : null;
      },

      async findByUUID(uuid: string) {
        const row = vaultDatabase
          .select()
          .from(referencesTable)
          .where(eq(referencesTable.uuid, uuid))
          .get();
        return row ? assembleReference(row) : null;
      },
    },

    sequences: {
      async findAll() {
        const rows = vaultDatabase.select().from(sequencesTable).all();
        return loadSequenceRelations(rows);
      },

      async findByUUID(uuid: string) {
        const row = vaultDatabase
          .select()
          .from(sequencesTable)
          .where(eq(sequencesTable.uuid, uuid))
          .get();

        if (!row) return null;
        const results = await loadSequenceRelations([row]);
        return results[0] ?? null;
      },

      async findMain() {
        const row = vaultDatabase
          .select()
          .from(sequencesTable)
          .where(eq(sequencesTable.isMain, true))
          .get();

        if (!row) return null;
        const results = await loadSequenceRelations([row]);
        return results[0] ?? null;
      },

      async findFilePath(uuid: string) {
        const row = vaultDatabase
          .select({ filePath: sequencesTable.filePath })
          .from(sequencesTable)
          .where(eq(sequencesTable.uuid, uuid))
          .get();

        if (!row) return null;
        return row.filePath;
      },
    },

    links: {
      async findBacklinks(targetType: LinkEntityKind, targetKey: string): Promise<BacklinkRow[]> {
        return findBacklinks(vaultDatabase, targetType, targetKey);
      },
      async findOutgoing(
        sourceType: LinkSourceType,
        sourceUuid: string,
      ): Promise<OutgoingLinkRow[]> {
        return findOutgoingLinks(vaultDatabase, sourceType, sourceUuid);
      },
    },

    margins: {
      async findByFragmentUuid(fragmentUuid: string): Promise<IndexedMargin | null> {
        const row = vaultDatabase
          .select()
          .from(marginsTable)
          .where(eq(marginsTable.fragmentUuid, fragmentUuid))
          .get();
        if (!row) return null;

        const commentRows = vaultDatabase
          .select()
          .from(commentsTable)
          .where(eq(commentsTable.fragmentUuid, fragmentUuid))
          .all();

        return assembleMargin(row, commentRows);
      },

      async findFilePath(fragmentUuid: string): Promise<string | null> {
        const row = vaultDatabase
          .select({ filePath: marginsTable.filePath })
          .from(marginsTable)
          .where(eq(marginsTable.fragmentUuid, fragmentUuid))
          .get();
        return row?.filePath ?? null;
      },
    },
  };
};
