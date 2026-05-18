import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setupDraftVault, type DraftTestVault } from "./setup";
import { createDraft } from "../../drafts/create";
import { deleteDraft } from "../../drafts/delete";
import { listDrafts } from "../../drafts/list";
import { DraftError } from "../../drafts/errors";
import { draftsRoot } from "../../drafts/paths";

let vault: DraftTestVault;

beforeEach(async () => {
  vault = await setupDraftVault();
});

afterEach(() => {
  vault.cleanup();
});

describe("deleteDraft", () => {
  it("removes the draft directory and disappears from listDrafts", async () => {
    const draft = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Draft 1",
    });

    const draftPath = join(draftsRoot(vault.vaultPath), draft.directoryName);
    expect(existsSync(draftPath)).toBe(true);

    const removed = await deleteDraft(vault.vaultPath, draft.uuid);
    expect(removed.uuid).toBe(draft.uuid);
    expect(existsSync(draftPath)).toBe(false);

    const drafts = await listDrafts(vault.vaultPath);
    expect(drafts).toHaveLength(0);
  });

  it("throws DRAFT_NOT_FOUND for a missing uuid", async () => {
    let error: unknown;
    try {
      await deleteDraft(vault.vaultPath, "00000000-0000-0000-0000-000000000000");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DraftError);
    expect((error as DraftError).code).toBe("DRAFT_NOT_FOUND");
  });
});
