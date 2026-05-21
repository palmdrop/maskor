import type { createStorageService } from "@maskor/storage";
import type { ProjectContext } from "@maskor/storage";

type StorageService = ReturnType<typeof createStorageService>;
type SourceEntityType = "fragment" | "note" | "reference" | "aspect";

export const resolveSourceKey = async (
  storageService: StorageService,
  projectContext: ProjectContext,
  sourceUuid: string,
  sourceType: SourceEntityType,
): Promise<string> => {
  switch (sourceType) {
    case "fragment": {
      const entity = await storageService.fragments.read(projectContext, sourceUuid);
      return entity.key;
    }
    case "note": {
      const entity = await storageService.notes.read(projectContext, sourceUuid);
      return entity.key;
    }
    case "reference": {
      const entity = await storageService.references.read(projectContext, sourceUuid);
      return entity.key;
    }
    case "aspect": {
      const entity = await storageService.aspects.read(projectContext, sourceUuid);
      return entity.key;
    }
  }
};
