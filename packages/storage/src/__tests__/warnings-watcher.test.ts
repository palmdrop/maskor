import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import { createVaultWatcher } from "../watcher/watcher";
import type { VaultWatcher } from "../watcher/types";
import type { VaultSyncEvent } from "@maskor/shared";
import { BASIC_VAULT } from "@maskor/test-fixtures";
import { listWarnings } from "../warnings/warnings-repo";

const waitFor = (predicate: () => boolean, timeoutMs = 2000): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  });

let tmpDir: string;
let vaultDir: string;
let watcher: VaultWatcher | null = null;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-warnings-watcher-test-"));
  vaultDir = join(tmpDir, "vault");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(async () => {
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

const WATCHER_READY_DELAY_MS = 300;

const rebuildAndWatch = async () => {
  const vault = createVault({ root: vaultDir });
  const vaultDatabase = createVaultDatabase(vaultDir);
  const events: VaultSyncEvent[] = [];
  const emit = (event: VaultSyncEvent) => events.push(event);

  const indexer = createVaultIndexer(vaultDatabase, vault);
  await indexer.rebuild();

  const created = createVaultWatcher(vaultDatabase, vault, emit, undefined, {
    onNoteRename: async () => {},
    onReferenceRename: async () => {},
    onAspectRename: async () => {},
  });
  created.start();
  watcher = created;
  await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));
  return { vault, vaultDatabase, events };
};

const warningEventCount = (events: VaultSyncEvent[]): number =>
  events.filter((event) => event.type === "vault:warning").length;

describe("watcher — wrong-format files", () => {
  it("records a WRONG_FORMAT_FILE warning and emits vault:warning when a .docx is dropped in", async () => {
    const { vaultDatabase, events } = await rebuildAndWatch();

    writeFileSync(join(vaultDir, "fragments", "imported.docx"), "binary");
    await waitFor(() => warningEventCount(events) > 0);

    const warnings = listWarnings(vaultDatabase);
    const wrongFormat = warnings.filter((warning) => warning.kind === "WRONG_FORMAT_FILE");
    expect(wrongFormat).toHaveLength(1);
    expect(wrongFormat[0]).toMatchObject({ filePath: "fragments/imported.docx" });
  });

  it("clears the warning and emits vault:warning when the wrong-format file is removed", async () => {
    const { vaultDatabase, events } = await rebuildAndWatch();
    const docxPath = join(vaultDir, "fragments", "imported.docx");

    writeFileSync(docxPath, "binary");
    await waitFor(() => warningEventCount(events) > 0);
    const afterAdd = warningEventCount(events);

    unlinkSync(docxPath);
    await waitFor(() => warningEventCount(events) > afterAdd);

    const warnings = listWarnings(vaultDatabase);
    expect(warnings.filter((warning) => warning.kind === "WRONG_FORMAT_FILE")).toHaveLength(0);
  });
});

describe("watcher — UUID collision", () => {
  it("records a UUID_COLLISION event warning and emits vault:warning", async () => {
    const { vault, vaultDatabase, events } = await rebuildAndWatch();

    const fragments = await vault.fragments.readAll();
    const existing = fragments[0]!;

    // A new file reusing an existing UUID at a different path triggers a collision.
    writeFileSync(
      join(vaultDir, "fragments", "duplicate.md"),
      `---\nuuid: "${existing.uuid}"\nkey: duplicate\n---\n\nDuplicate body.\n`,
    );

    await waitFor(() => warningEventCount(events) > 0);

    const collisions = listWarnings(vaultDatabase).filter(
      (warning) => warning.kind === "UUID_COLLISION",
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ kind: "UUID_COLLISION" });
    if (collisions[0]!.kind === "UUID_COLLISION") {
      expect(collisions[0]!.filePath).toBe("fragments/duplicate.md");
    }
  });
});

describe("watcher — unknown aspect key", () => {
  it("records a UNKNOWN_ASPECT_KEY warning and clears it on a clean re-sync", async () => {
    const { vault, vaultDatabase } = await rebuildAndWatch();

    const fragments = await vault.fragments.readAll();
    const target = fragments[0]!;

    await vault.fragments.write({
      ...target,
      aspects: { ...target.aspects, "phantom-aspect": { weight: 0.5 } },
    });
    await waitFor(() =>
      listWarnings(vaultDatabase).some((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    );

    const unknown = listWarnings(vaultDatabase).filter(
      (warning) => warning.kind === "UNKNOWN_ASPECT_KEY",
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ aspectKey: "phantom-aspect" });

    // Re-save without the phantom key → warning cleared.
    await vault.fragments.write({ ...target, aspects: target.aspects });
    await waitFor(
      () => !listWarnings(vaultDatabase).some((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    );

    expect(
      listWarnings(vaultDatabase).filter((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    ).toHaveLength(0);
  });
});
