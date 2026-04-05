// --- assembly helpers ---

import type { AspectUUID, FragmentUUID, Pool } from "@maskor/shared/src";
import type { aspectsTable, fragmentsTable } from "../db/vault/schema";
import type { IndexedAspect, IndexedFragment } from "./types";

export const assembleFragment = (
  row: typeof fragmentsTable.$inferSelect,
  noteRows: Array<{ noteTitle: string }>,
  referenceRows: Array<{ referenceName: string }>,
  propertyRows: Array<{
    aspectKey: string;
    aspectUuid: string | null;
    weight: number;
  }>,
): IndexedFragment => ({
  uuid: row.uuid as FragmentUUID,
  title: row.title,
  version: row.version,
  pool: row.pool as Pool,
  readyStatus: row.readyStatus,
  contentHash: row.contentHash,
  filePath: row.filePath,
  notes: noteRows.map((note) => note.noteTitle),
  references: referenceRows.map((reference) => reference.referenceName),
  properties: propertyRows.reduce(
    (acc, property) => {
      acc[property.aspectKey] = {
        weight: property.weight,
        aspectUuid: property.aspectUuid as AspectUUID | null,
      };
      return acc;
    },
    {} as IndexedFragment["properties"],
  ),
});

export const assembleAspect = (
  row: typeof aspectsTable.$inferSelect,
  noteRows: Array<{ noteTitle: string }>,
): IndexedAspect => ({
  uuid: row.uuid as AspectUUID,
  key: row.key,
  category: row.category ?? undefined,
  filePath: row.filePath,
  notes: noteRows.map((note) => note.noteTitle),
});
