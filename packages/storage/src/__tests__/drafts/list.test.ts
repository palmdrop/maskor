import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setupDraftVault, type DraftTestVault } from "./setup";
import { createDraft } from "../../drafts/create";
import { listDrafts } from "../../drafts/list";
import {
  draftsRoot,
  restoreAsideRoot,
  stagingRoot,
} from "../../drafts/paths";

let vault: DraftTestVault;

beforeEach(async () => {
  vault = await setupDraftVault();
});

afterEach(() => {
  vault.cleanup();
});

describe("listDrafts", () => {
  it("returns an empty array when no drafts directory exists", async () => {
    const drafts = await listDrafts(vault.vaultPath);
    expect(drafts).toEqual([]);
  });

  it("returns drafts sorted by createdAt desc", async () => {
    const first = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "First",
    });
    // Ensure distinct timestamps.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Second",
    });

    const drafts = await listDrafts(vault.vaultPath);
    expect(drafts.map((d) => d.uuid)).toEqual([second.uuid, first.uuid]);
  });

  it("ignores the .staging and .restore-aside reserved directories", async () => {
    mkdirSync(stagingRoot(vault.vaultPath), { recursive: true });
    mkdirSync(restoreAsideRoot(vault.vaultPath), { recursive: true });

    await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Real",
    });

    const drafts = await listDrafts(vault.vaultPath);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.name).toBe("Real");
  });

  it("ignores directories without a valid manifest", async () => {
    await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Real",
    });
    const bogus = join(draftsRoot(vault.vaultPath), "not-a-draft");
    mkdirSync(bogus, { recursive: true });
    writeFileSync(join(bogus, "manifest.json"), "not-json", "utf8");

    const drafts = await listDrafts(vault.vaultPath);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.name).toBe("Real");
  });
});
