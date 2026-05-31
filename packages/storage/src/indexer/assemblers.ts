// --- assembly helpers ---

import type {
  aspectsTable,
  fragmentPositionsTable,
  fragmentsTable,
  notesTable,
  referencesTable,
  sectionsTable,
  sequencesTable,
} from "../db/vault/schema";
import type {
  IndexedAspect,
  IndexedFragment,
  IndexedNote,
  IndexedReference,
  IndexedSequence,
} from "./types";
import { deriveCategory } from "../utils/category";

export const assembleFragment = (
  row: typeof fragmentsTable.$inferSelect,
  noteRows: Array<{ noteKey: string }>,
  referenceRows: Array<{ referenceKey: string }>,
  propertyRows: Array<{
    aspectKey: string;
    weight: number;
  }>,
): IndexedFragment => ({
  uuid: row.uuid,
  key: row.key,
  isDiscarded: row.isDiscarded,
  readiness: row.readiness,
  contentHash: row.contentHash,
  filePath: row.filePath,
  updatedAt: row.updatedAt,
  notes: noteRows.map((note) => note.noteKey),
  references: referenceRows.map((reference) => reference.referenceKey),
  aspects: propertyRows.reduce(
    (acc, property) => {
      acc[property.aspectKey] = { weight: property.weight };
      return acc;
    },
    {} as IndexedFragment["aspects"],
  ),
});

export const assembleAspect = (
  row: typeof aspectsTable.$inferSelect,
  noteRows: Array<{ noteKey: string }>,
): IndexedAspect => ({
  uuid: row.uuid,
  key: row.key,
  category: deriveCategory(row.filePath),
  color: row.color ?? undefined,
  filePath: row.filePath,
  notes: noteRows.map((note) => note.noteKey),
});

export const assembleNote = (row: typeof notesTable.$inferSelect): IndexedNote => ({
  uuid: row.uuid,
  key: row.key,
  category: deriveCategory(row.filePath),
  filePath: row.filePath,
});

export const assembleReference = (row: typeof referencesTable.$inferSelect): IndexedReference => ({
  uuid: row.uuid,
  key: row.key,
  category: deriveCategory(row.filePath),
  filePath: row.filePath,
});

export const assembleSequence = (
  row: typeof sequencesTable.$inferSelect,
  sectionRows: Array<typeof sectionsTable.$inferSelect>,
  fragmentPositionRows: Array<typeof fragmentPositionsTable.$inferSelect>,
): IndexedSequence => ({
  uuid: row.uuid,
  name: row.name,
  isMain: row.isMain,
  active: row.active,
  ...(row.origin ? { origin: row.origin } : {}),
  projectUuid: row.projectUuid,
  filePath: row.filePath,
  contentHash: row.contentHash,
  sections: [...sectionRows]
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      uuid: section.uuid,
      name: section.name,
      fragments: fragmentPositionRows
        .filter((fp) => fp.sectionUuid === section.uuid)
        .sort((a, b) => a.position - b.position)
        .map((fp) => ({
          uuid: fp.uuid,
          fragmentUuid: fp.fragmentUuid,
          position: fp.position,
        })),
    })),
});
