import type { ProjectRecord } from "@maskor/storage";
import type { GlobalCommand } from "../types";

type UpdateProjectVaultPathInput = {
  projectUUID: string;
  newPath: string;
  forceOverride?: boolean;
};

export const updateProjectVaultPathCommand: GlobalCommand<UpdateProjectVaultPathInput, ProjectRecord> = {
  async execute(ctx, { projectUUID, newPath, forceOverride }) {
    return ctx.storageService.updateProjectVaultPath(projectUUID, newPath, forceOverride);
  },
};
