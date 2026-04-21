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

// NULL aspectUuid means the aspect key didn't resolve — signals drift
export type IndexedFragmentProperty = {
  weight: number;
  aspectUuid: string | null;
};

export type IndexedFragment = {
  uuid: string;
  title: string;
  version: number;
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
  title: string;
  filePath: string;
};

export type IndexedReference = {
  uuid: string;
  name: string;
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
    findByTitle(title: string): Promise<IndexedNote | null>;
    findByUUID(uuid: string): Promise<IndexedNote | null>;
  };

  references: {
    findAll(): Promise<IndexedReference[]>;
    findByName(name: string): Promise<IndexedReference | null>;
    findByUUID(uuid: string): Promise<IndexedReference | null>;
  };
}
