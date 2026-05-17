import { moveToTrashOrDelete } from "../../helpers/trash";
import type { GlobalCommand } from "../types";

type RemoveProjectInput = {
  projectUUID: string;
  deleteFiles?: boolean;
};

type RemoveProjectOutput = {
  method?: "trash" | "hard-delete";
};

export const removeProjectCommand: GlobalCommand<RemoveProjectInput, RemoveProjectOutput> = {
  async execute(ctx, { projectUUID, deleteFiles }) {
    if (deleteFiles) {
      const project = await ctx.storageService.getProject(projectUUID);
      const { method } = await moveToTrashOrDelete(project.vaultPath);
      await ctx.storageService.removeProject(projectUUID);
      return { method };
    }
    await ctx.storageService.removeProject(projectUUID);
    return {};
  },
};
