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
  durationMs: number;
  warnings: SyncWarning[];
};

export type IndexedFragmentProperty = {
  weight: number;
};

export type IndexedFragment = {
  uuid: string;
  title: string;
  isDiscarded: boolean;
  readyStatus: number;
  contentHash: string;
  filePath: string;
  updatedAt: Date;
  notes: string[];
  references: string[];
  properties: Record<string, IndexedFragmentProperty>;
};

export type IndexedAspect = {
  uuid: string;
  key: string;
  category?: string;
  filePath: string;
  notes: string[];
};

export type IndexedNote = {
  uuid: string;
  key: string;
  filePath: string;
};

export type IndexedReference = {
  uuid: string;
  key: string;
  filePath: string;
};

export interface VaultIndexer {
  rebuild(): Promise<RebuildStats>;

  fragments: {
    findAll(): Promise<IndexedFragment[]>;
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
}
