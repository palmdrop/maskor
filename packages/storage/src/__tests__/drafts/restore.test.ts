import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { setupDraftVault, type DraftTestVault } from "./setup";
import { createDraft } from "../../drafts/create";
import { restoreDraft } from "../../drafts/restore";
import { DraftError } from "../../drafts/errors";
import { draftsRoot, restoreAsideRoot } from "../../drafts/paths";

let vault: DraftTestVault;

beforeEach(async () => {
  vault = await setupDraftVault();
});

afterEach(() => {
  vault.cleanup();
});

describe("restoreDraft", () => {
  it("swaps live entries with the snapshot's content", async () => {
    // Add a fragment to the live vault before snapshotting.
    const fragmentsDir = join(vault.vaultPath, "fragments");
    mkdirSync(fragmentsDir, { recursive: true });
    writeFileSync(
      join(fragmentsDir, "snapshot-only.md"),
      '---\nuuid: "11111111-1111-1111-1111-111111111111"\n---\n\nSnapshot version.\n',
      "utf8",
    );

    const draft = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Snapshot",
    });

    // Mutate the live fragment after snapshotting.
    writeFileSync(
      join(fragmentsDir, "snapshot-only.md"),
      '---\nuuid: "11111111-1111-1111-1111-111111111111"\n---\n\nLive mutation.\n',
      "utf8",
    );
    expect(readFileSync(join(fragmentsDir, "snapshot-only.md"), "utf8")).toContain(
      "Live mutation.",
    );

    await restoreDraft({ vaultPath: vault.vaultPath, uuid: draft.uuid });

    expect(readFileSync(join(fragmentsDir, "snapshot-only.md"), "utf8")).toContain(
      "Snapshot version.",
    );
    expect(existsSync(restoreAsideRoot(vault.vaultPath))).toBe(false);
  });

  it("preserves the live action-log.jsonl byte-for-byte", async () => {
    const draft = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Snapshot",
    });

    const logPath = join(vault.vaultPath, ".maskor", "action-log.jsonl");
    const livePost =
      '\n{"id":"after","timestamp":"2026-02-01T00:00:00Z","type":"fragment:created","actor":"user","target":{"type":"fragment","uuid":"f2"},"payload":{},"undoable":false}\n';
    writeFileSync(logPath, readFileSync(logPath, "utf8") + livePost, "utf8");
    const beforeRestore = readFileSync(logPath, "utf8");

    await restoreDraft({ vaultPath: vault.vaultPath, uuid: draft.uuid });

    const afterRestore = readFileSync(logPath, "utf8");
    expect(afterRestore).toBe(beforeRestore);
  });

  it("preserves the live project.json byte-for-byte", async () => {
    const draft = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Snapshot",
    });

    const projectPath = join(vault.vaultPath, ".maskor", "project.json");
    writeFileSync(
      projectPath,
      JSON.stringify({ name: "live-after-snapshot", marker: "still-live" }, null, 2),
      "utf8",
    );
    const beforeRestore = readFileSync(projectPath, "utf8");

    await restoreDraft({ vaultPath: vault.vaultPath, uuid: draft.uuid });

    const afterRestore = readFileSync(projectPath, "utf8");
    expect(afterRestore).toBe(beforeRestore);
  });

  it("throws DRAFT_NOT_FOUND for missing uuid", async () => {
    let error: unknown;
    try {
      await restoreDraft({
        vaultPath: vault.vaultPath,
        uuid: "00000000-0000-0000-0000-000000000000",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DraftError);
    expect((error as DraftError).code).toBe("DRAFT_NOT_FOUND");
  });

  // Regression: if `cp` from the snapshot to the live path throws partway,
  // copiedIntoLive doesn't get the entry, but livePath holds a partial copy.
  // The rollback must clear that partial copy before renaming the aside back,
  // otherwise the rename fails and the live data is lost.
  it("rolls back live state when cp fails mid-copy", async () => {
    const fragmentsDir = join(vault.vaultPath, "fragments");
    mkdirSync(fragmentsDir, { recursive: true });
    writeFileSync(
      join(fragmentsDir, "rollback-target.md"),
      '---\nuuid: "33333333-3333-3333-3333-333333333333"\n---\n\nlive original\n',
      "utf8",
    );

    const draft = await createDraft({
      vaultPath: vault.vaultPath,
      vaultDatabase: vault.vaultDatabase,
      name: "Rollback test",
    });

    // Corrupt the snapshot so cp fails for fragments/.
    const snapshotFile = join(
      draftsRoot(vault.vaultPath),
      draft.directoryName,
      "fragments",
      "rollback-target.md",
    );
    chmodSync(snapshotFile, 0o000);

    // Mutate the live copy so we can detect that rollback restored it.
    writeFileSync(
      join(fragmentsDir, "rollback-target.md"),
      '---\nuuid: "33333333-3333-3333-3333-333333333333"\n---\n\nlive updated\n',
      "utf8",
    );

    let restoreError: unknown;
    try {
      await restoreDraft({ vaultPath: vault.vaultPath, uuid: draft.uuid });
    } catch (caught) {
      restoreError = caught;
    } finally {
      // Restore permissions so afterEach cleanup can delete the tmpdir.
      chmodSync(snapshotFile, 0o644);
    }

    expect(restoreError).toBeDefined();
    expect(readFileSync(join(fragmentsDir, "rollback-target.md"), "utf8")).toContain(
      "live updated",
    );
    expect(existsSync(restoreAsideRoot(vault.vaultPath))).toBe(false);
  });
});
