import type { ProjectRecord } from "@maskor/storage";
import type { ProjectUpdate } from "@maskor/shared";
import type { GlobalCommand } from "../types";

type UpdateProjectInput = {
  projectUUID: string;
  patch: ProjectUpdate;
};

export const updateProjectCommand: GlobalCommand<UpdateProjectInput, ProjectRecord> = {
  async execute(ctx, { projectUUID, patch }) {
    return ctx.storageService.updateProject(projectUUID, patch);
  },
};
