import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";

export type Settings = {
  maskorManagedRoot: string;
};

const defaultMaskorManagedRoot = (): string => {
  if (platform() === "win32") {
    return join(process.env["USERPROFILE"] ?? homedir(), "Documents", "Maskor");
  }
  return join(homedir(), "Documents", "Maskor");
};

const DEFAULTS: Settings = {
  maskorManagedRoot: defaultMaskorManagedRoot(),
};

export type SettingsReadResult = {
  settings: Settings;
  warning?: string;
};

export type SettingsService = {
  readSettings(): Promise<SettingsReadResult>;
  writeSettings(patch: Partial<Settings>): Promise<void>;
};

export const createSettingsService = (configDirectory: string): SettingsService => {
  const settingsPath = join(configDirectory, "settings.json");

  const readSettings = async (): Promise<SettingsReadResult> => {
    let raw: string;
    try {
      raw = await readFile(settingsPath, "utf-8");
    } catch {
      return { settings: { ...DEFAULTS } };
    }

    let parsed: Partial<Settings>;
    try {
      parsed = JSON.parse(raw) as Partial<Settings>;
    } catch {
      return {
        settings: { ...DEFAULTS },
        warning: `Settings file at ${settingsPath} could not be parsed; using defaults.`,
      };
    }

    return {
      settings: {
        maskorManagedRoot: parsed.maskorManagedRoot ?? DEFAULTS.maskorManagedRoot,
      },
    };
  };

  const writeSettings = async (patch: Partial<Settings>): Promise<void> => {
    const { settings: current } = await readSettings();
    const updated: Settings = { ...current, ...patch };
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(updated, null, 2), "utf-8");
  };

  return { readSettings, writeSettings };
};
