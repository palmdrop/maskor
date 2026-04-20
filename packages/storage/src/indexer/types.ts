import type { AspectUUID, FragmentUUID, NoteUUID, ReferenceUUID } from "@maskor/shared";

export type SyncWarning = {
  kind: "UNKNOWN_ASPECT_KEY";
  aspectKey: string;
  fragmentUuids: FragmentUUID[];
};

export type RebuildStats = {
  fragments: number;
  aspects: number;
  notes: number;
  references: number;
  durationMs: number;
  warnings: SyncWarning[];
};

// NULL aspectUuid means the aspect key didn't resolve — signals drift
export type IndexedFragmentProperty = {
  weight: number;
  aspectUuid: AspectUUID | null;
};

export type IndexedFragment = {
  uuid: FragmentUUID;
  title: string;
  version: number;
  isDiscarded: boolean;
  readyStatus: number;
  contentHash: string;
  filePath: string;
  notes: string[];
  references: string[];
  properties: Record<string, IndexedFragmentProperty>;
};

export type IndexedAspect = {
  uuid: AspectUUID;
  key: string;
  category?: string;
  filePath: string;
  notes: string[];
};

export type IndexedNote = {
  uuid: NoteUUID;
  title: string;
  filePath: string;
};

export type IndexedReference = {
  uuid: ReferenceUUID;
  name: string;
  filePath: string;
};

export interface VaultIndexer {
  rebuild(): Promise<RebuildStats>;

  fragments: {
    findAll(): Promise<IndexedFragment[]>;
    findByUUID(uuid: FragmentUUID): Promise<IndexedFragment | null>;
    findFilePath(uuid: FragmentUUID): Promise<string | null>;
  };

  aspects: {
    findAll(): Promise<IndexedAspect[]>;
    findByKey(key: string): Promise<IndexedAspect | null>;
    findByUUID(uuid: AspectUUID): Promise<IndexedAspect | null>;
  };

  notes: {
    findAll(): Promise<IndexedNote[]>;
    findByTitle(title: string): Promise<IndexedNote | null>;
    findByUUID(uuid: NoteUUID): Promise<IndexedNote | null>;
  };

  references: {
    findAll(): Promise<IndexedReference[]>;
    findByName(name: string): Promise<IndexedReference | null>;
    findByUUID(uuid: ReferenceUUID): Promise<IndexedReference | null>;
  };
}
