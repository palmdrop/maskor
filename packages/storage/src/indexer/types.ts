export type SyncWarning = {
  kind: "UNKNOWN_ASPECT_KEY";
  aspectKey: string;
  fragmentUuids: string[];
};

export type RebuildStats = {
  fragments: number;
  aspects: number;
  notes: number;
  references: number;
  sequences: number;
  durationMs: number;
  warnings: SyncWarning[];
};

export type IndexedFragmentAspect = {
  weight: number;
};

export type IndexedFragment = {
  uuid: string;
  key: string;
  isDiscarded: boolean;
  readiness: number;
  contentHash: string;
  filePath: string;
  updatedAt: Date;
  notes: string[];
  references: string[];
  aspects: Record<string, IndexedFragmentAspect>;
};

export type IndexedFragmentSummary = {
  uuid: string;
  key: string;
  isDiscarded: boolean;
  excerpt: string | null;
  aspects: Record<string, IndexedFragmentAspect>;
};

export type IndexedAspect = {
  uuid: string;
  key: string;
  category?: string;
  color?: string;
  filePath: string;
  notes: string[];
};

export type IndexedNote = {
  uuid: string;
  key: string;
  category?: string;
  filePath: string;
};

export type IndexedReference = {
  uuid: string;
  key: string;
  category?: string;
  filePath: string;
};

export type IndexedSequence = {
  uuid: string;
  name: string;
  isMain: boolean;
  projectUuid: string;
  filePath: string;
  contentHash: string;
  sections: Array<{
    uuid: string;
    name: string;
    fragments: Array<{
      uuid: string;
      fragmentUuid: string;
      position: number;
    }>;
  }>;
};

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
