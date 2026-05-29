import type { Aspect, Fragment, Note, Reference, Sequence } from "@maskor/shared";

// A detected vault warning (content only — the stored form adds id/category/timestamps,
// see warnings/warnings-repo.ts). Discriminated on `kind`.
export type SyncWarning =
  | { kind: "UNKNOWN_ASPECT_KEY"; aspectKey: string; fragmentUuids: string[] }
  | { kind: "WRONG_FORMAT_FILE"; filePath: string }
  | { kind: "UUID_COLLISION"; filePath: string; collidingPath: string; newUuid: string };

// The only warning kind produced during fragment upsert / rebuild's stats payload.
export type UnknownAspectKeyWarning = Extract<SyncWarning, { kind: "UNKNOWN_ASPECT_KEY" }>;

export type RebuildStats = {
  fragments: number;
  aspects: number;
  notes: number;
  references: number;
  sequences: number;
  durationMs: number;
  warnings: UnknownAspectKeyWarning[];
};

export type IndexedFragment = Omit<Fragment, "content"> & { filePath: string };

export type IndexedFragmentSummary = Pick<
  IndexedFragment,
  "uuid" | "key" | "isDiscarded" | "aspects"
> & { excerpt: string | null };

export type IndexedAspect = Omit<Aspect, "description"> & { filePath: string };

export type IndexedNote = Omit<Note, "content"> & { filePath: string };

export type IndexedReference = Omit<Reference, "content"> & { filePath: string };

export type IndexedSequence = Sequence & { filePath: string; contentHash: string };

export interface VaultIndexer {
  rebuild(): Promise<RebuildStats>;

  fragments: {
    findAll(): Promise<IndexedFragment[]>;
    findAllSummaries(): Promise<IndexedFragmentSummary[]>;
    findByUUID(uuid: string): Promise<IndexedFragment | null>;
    findFilePath(uuid: string): Promise<string | null>;
  };

  aspects: {
    findAll(): Promise<IndexedAspect[]>;
    findByKey(key: string): Promise<IndexedAspect | null>;
    findByUUID(uuid: string): Promise<IndexedAspect | null>;
  };

  notes: {
    findAll(): Promise<IndexedNote[]>;
    findByKey(key: string): Promise<IndexedNote | null>;
    findByUUID(uuid: string): Promise<IndexedNote | null>;
  };

  references: {
    findAll(): Promise<IndexedReference[]>;
    findByKey(key: string): Promise<IndexedReference | null>;
    findByUUID(uuid: string): Promise<IndexedReference | null>;
  };

  sequences: {
    findAll(): Promise<IndexedSequence[]>;
    findByUUID(uuid: string): Promise<IndexedSequence | null>;
    findMain(): Promise<IndexedSequence | null>;
    findFilePath(uuid: string): Promise<string | null>;
  };
}
