import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir, platform } from "node:os";
import { createSettingsService } from "../settings/settings-service";

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "maskor-settings-test-"));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

const expectedDefault = (): string => {
  if (platform() === "win32") {
    return join(process.env["USERPROFILE"] ?? homedir(), "Documents", "Maskor");
  }
  return join(homedir(), "Documents", "Maskor");
};

describe("createSettingsService", () => {
  describe("readSettings", () => {
    it("returns defaults when settings file is missing", async () => {
      const service = createSettingsService(configDir);
      const { settings, warning } = await service.readSettings();
      expect(settings.maskorManagedRoot).toBe(expectedDefault());
      expect(warning).toBeUndefined();
    });

    it("returns defaults for a missing key in an otherwise valid file", async () => {
      const settingsPath = join(configDir, "settings.json");
      writeFileSync(settingsPath, JSON.stringify({}), "utf-8");
      const service = createSettingsService(configDir);
      const { settings, warning } = await service.readSettings();
      expect(settings.maskorManagedRoot).toBe(expectedDefault());
      expect(warning).toBeUndefined();
    });

    it("returns stored value when present", async () => {
      const settingsPath = join(configDir, "settings.json");
      const customRoot = "/custom/maskor/root";
      writeFileSync(settingsPath, JSON.stringify({ maskorManagedRoot: customRoot }), "utf-8");
      const service = createSettingsService(configDir);
      const { settings, warning } = await service.readSettings();
      expect(settings.maskorManagedRoot).toBe(customRoot);
      expect(warning).toBeUndefined();
    });

    it("returns defaults + warning when file is unparsable", async () => {
      const settingsPath = join(configDir, "settings.json");
      writeFileSync(settingsPath, "{ this is not json }", "utf-8");
      const service = createSettingsService(configDir);
      const { settings, warning } = await service.readSettings();
      expect(settings.maskorManagedRoot).toBe(expectedDefault());
      expect(warning).toBeTypeOf("string");
      expect(warning).toContain("could not be parsed");
    });
  });

  describe("writeSettings", () => {
    it("creates the settings file on first write", async () => {
      const service = createSettingsService(configDir);
      const customRoot = "/my/projects";
      await service.writeSettings({ maskorManagedRoot: customRoot });

      const settingsFile = Bun.file(join(configDir, "settings.json"));
      expect(await settingsFile.exists()).toBe(true);
      const stored = (await settingsFile.json()) as { maskorManagedRoot: string };
      expect(stored.maskorManagedRoot).toBe(customRoot);
    });

    it("does not create the file on read (only on write)", async () => {
      const service = createSettingsService(configDir);
      await service.readSettings();

      const settingsFile = Bun.file(join(configDir, "settings.json"));
      expect(await settingsFile.exists()).toBe(false);
    });

    it("merges patch with existing settings on subsequent writes", async () => {
      const service = createSettingsService(configDir);
      await service.writeSettings({ maskorManagedRoot: "/first" });
      await service.writeSettings({ maskorManagedRoot: "/second" });

      const { settings } = await service.readSettings();
      expect(settings.maskorManagedRoot).toBe("/second");
    });

    it("creates intermediate directories when config directory does not yet exist", async () => {
      const nestedConfigDir = join(configDir, "deep", "nested");
      const service = createSettingsService(nestedConfigDir);
      await expect(service.writeSettings({ maskorManagedRoot: "/root" })).resolves.toBeUndefined();

      const settingsFile = Bun.file(join(nestedConfigDir, "settings.json"));
      expect(await settingsFile.exists()).toBe(true);
    });
  });
});
