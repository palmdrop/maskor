import type { ProjectRecord } from "@maskor/storage";
import type { GlobalCommand } from "../types";

type RegisterProjectInput = {
  name: string;
  vaultPath: string;
  mode: "adopt" | "create";
};

export const registerProjectCommand: GlobalCommand<RegisterProjectInput, ProjectRecord> = {
  async execute(ctx, input) {
    return ctx.storageService.registerProject(input.name, input.vaultPath, input.mode);
  },
};
