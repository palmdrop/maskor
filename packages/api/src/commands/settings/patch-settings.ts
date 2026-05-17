import type { SettingsService } from "@maskor/storage";
import type { GlobalCommand } from "../types";

type PatchSettingsInput = {
  maskorManagedRoot?: string;
};

type PatchSettingsOutput = {
  maskorManagedRoot: string;
  warning?: string;
};

export const createPatchSettingsCommand = (
  settingsService: SettingsService,
): GlobalCommand<PatchSettingsInput, PatchSettingsOutput> => ({
  async execute(_ctx, patch) {
    await settingsService.writeSettings(patch);
    const { settings, warning } = await settingsService.readSettings();
    return { ...settings, ...(warning !== undefined ? { warning } : {}) };
  },
});
