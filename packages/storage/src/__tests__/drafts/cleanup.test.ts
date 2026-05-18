import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync } from "node:fs";
import { setupDraftVault, type DraftTestVault } from "./setup";
import { cleanupStaleDirectories } from "../../drafts/cleanup";
import { restoreAsideRoot, stagingRoot } from "../../drafts/paths";

let vault: DraftTestVault;

beforeEach(async () => {
  vault = await setupDraftVault();
});

afterEach(() => {
  vault.cleanup();
});

describe("cleanupStaleDirectories", () => {
  it("removes a leftover .staging directory", async () => {
    mkdirSync(stagingRoot(vault.vaultPath), { recursive: true });
    await cleanupStaleDirectories(vault.vaultPath);
    expect(existsSync(stagingRoot(vault.vaultPath))).toBe(false);
  });

  it("removes a leftover .restore-aside directory", async () => {
    mkdirSync(restoreAsideRoot(vault.vaultPath), { recursive: true });
    await cleanupStaleDirectories(vault.vaultPath);
    expect(existsSync(restoreAsideRoot(vault.vaultPath))).toBe(false);
  });

  it("is a no-op when neither directory exists", async () => {
    await cleanupStaleDirectories(vault.vaultPath);
    expect(existsSync(stagingRoot(vault.vaultPath))).toBe(false);
    expect(existsSync(restoreAsideRoot(vault.vaultPath))).toBe(false);
  });
});
