import { cpSync } from "node:fs";
import type { ProjectRecord } from "@maskor/storage";
import type { createStorageService } from "@maskor/storage";
import { BASIC_VAULT } from "@maskor/test-fixtures";

type StorageService = ReturnType<typeof createStorageService>;

type SeededVault = {
  project: ProjectRecord;
  vaultDirectory: string;
};

export const seedVault = async (
  storageService: StorageService,
  temporaryDirectory: string,
): Promise<SeededVault> => {
  const vaultDirectory = `${temporaryDirectory}/vault`;
  cpSync(BASIC_VAULT, vaultDirectory, { recursive: true });

  const project = await storageService.registerProject("Test Project", vaultDirectory);
  const context = await storageService.resolveProject(project.projectUUID);
  await storageService.index.rebuild(context);

  return { project, vaultDirectory };
};
