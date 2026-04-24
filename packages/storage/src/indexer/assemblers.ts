// --- assembly helpers ---

import type { aspectsTable, fragmentsTable } from "../db/vault/schema";
import type { IndexedAspect, IndexedFragment } from "./types";

export const assembleFragment = (
  row: typeof fragmentsTable.$inferSelect,
  noteRows: Array<{ noteTitle: string }>,
  referenceRows: Array<{ referenceName: string }>,
  propertyRows: Array<{
    aspectKey: string;
    weight: number;
  }>,
): IndexedFragment => ({
  uuid: row.uuid,
  title: row.title,
  isDiscarded: row.isDiscarded,
  readyStatus: row.readyStatus,
  contentHash: row.contentHash,
  filePath: row.filePath,
  updatedAt: row.updatedAt,
  notes: noteRows.map((note) => note.noteTitle),
  references: referenceRows.map((reference) => reference.referenceName),
  properties: propertyRows.reduce(
    (acc, property) => {
      acc[property.aspectKey] = { weight: property.weight };
      return acc;
    },
    {} as IndexedFragment["properties"],
  ),
});

export const assembleAspect = (
  row: typeof aspectsTable.$inferSelect,
  noteRows: Array<{ noteTitle: string }>,
): IndexedAspect => ({
  uuid: row.uuid,
  key: row.key,
  category: row.category ?? undefined,
  filePath: row.filePath,
  notes: noteRows.map((note) => note.noteTitle),
});
