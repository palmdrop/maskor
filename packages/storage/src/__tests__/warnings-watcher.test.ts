import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
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
import { loadKnownAspectKeys, findFragmentUuidsByAspectKey } from "../indexer/upserts";

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

describe("watcher — invalid entity file", () => {
  // Malformed YAML frontmatter — parseEntityFileOrThrow rejects it.
  const MALFORMED_FRAGMENT = "---\nkey: [unclosed\n---\nbody\n";

  it("records an INVALID_ENTITY_FILE warning and emits vault:warning when a malformed .md is dropped in", async () => {
    const { vaultDatabase, events } = await rebuildAndWatch();

    const brokenPath = join(vaultDir, "fragments", "broken.md");
    writeFileSync(brokenPath, MALFORMED_FRAGMENT);
    await waitFor(() => warningEventCount(events) > 0);

    const invalid = listWarnings(vaultDatabase).filter(
      (warning) => warning.kind === "INVALID_ENTITY_FILE",
    );
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({
      kind: "INVALID_ENTITY_FILE",
      filePath: "fragments/broken.md",
      entityKind: "fragment",
    });

    // The malformed file is left untouched on disk — never rewritten.
    expect(readFileSync(brokenPath, "utf8")).toBe(MALFORMED_FRAGMENT);
  });

  it("clears the warning when the malformed file is fixed", async () => {
    const { vault, vaultDatabase, events } = await rebuildAndWatch();

    const brokenPath = join(vaultDir, "fragments", "broken.md");
    writeFileSync(brokenPath, MALFORMED_FRAGMENT);
    await waitFor(() => warningEventCount(events) > 0);
    const afterAdd = warningEventCount(events);

    // Overwrite with valid content → parses, syncs, warning clears.
    writeFileSync(brokenPath, "---\nkey: broken\n---\n\nNow valid.\n");
    await waitFor(() => warningEventCount(events) > afterAdd);

    expect(
      listWarnings(vaultDatabase).filter((warning) => warning.kind === "INVALID_ENTITY_FILE"),
    ).toHaveLength(0);
    // And the now-valid fragment is indexed.
    expect((await vault.fragments.readAll()).some((fragment) => fragment.key === "broken")).toBe(
      true,
    );
  });

  it("clears the warning when the malformed file is removed", async () => {
    const { vaultDatabase, events } = await rebuildAndWatch();

    const brokenPath = join(vaultDir, "fragments", "broken.md");
    writeFileSync(brokenPath, MALFORMED_FRAGMENT);
    await waitFor(() => warningEventCount(events) > 0);
    const afterAdd = warningEventCount(events);

    unlinkSync(brokenPath);
    await waitFor(() => warningEventCount(events) > afterAdd);

    expect(
      listWarnings(vaultDatabase).filter((warning) => warning.kind === "INVALID_ENTITY_FILE"),
    ).toHaveLength(0);
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

  it("clears the warning when the missing aspect is created (no fragment edit needed)", async () => {
    const { vault, vaultDatabase } = await rebuildAndWatch();

    const target = (await vault.fragments.readAll())[0]!;
    await vault.fragments.write({
      ...target,
      aspects: { ...target.aspects, "phantom-aspect": { weight: 0.5 } },
    });
    await waitFor(() =>
      listWarnings(vaultDatabase).some((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    );

    // Creating the matching aspect makes the key known → the warning clears on the aspect sync,
    // without touching the referencing fragment.
    await vault.aspects.write({ uuid: crypto.randomUUID(), key: "phantom-aspect", notes: [] });
    await waitFor(
      () => !listWarnings(vaultDatabase).some((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    );

    expect(
      listWarnings(vaultDatabase).filter((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    ).toHaveLength(0);
  });

  it("clears the warning when the only fragment referencing the unknown key is deleted", async () => {
    const { vault, vaultDatabase } = await rebuildAndWatch();

    const base = (await vault.fragments.readAll())[0]!;
    await vault.fragments.write({
      ...base,
      uuid: crypto.randomUUID(),
      key: "delete-me",
      aspects: { "phantom-aspect": { weight: 0.5 } },
    });
    await waitFor(() =>
      listWarnings(vaultDatabase).some((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    );

    unlinkSync(join(vaultDir, "fragments", "delete-me.md"));
    await waitFor(
      () => !listWarnings(vaultDatabase).some((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    );

    expect(
      listWarnings(vaultDatabase).filter((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    ).toHaveLength(0);
  });

  it("records the warning when a referenced aspect is deleted", async () => {
    const { vault, vaultDatabase } = await rebuildAndWatch();

    // A fresh aspect plus a fragment referencing it — both known, so no warning yet.
    await vault.aspects.write({ uuid: crypto.randomUUID(), key: "temp-aspect", notes: [] });
    await waitFor(() => loadKnownAspectKeys(vaultDatabase).has("temp-aspect"));

    const base = (await vault.fragments.readAll())[0]!;
    await vault.fragments.write({
      ...base,
      uuid: crypto.randomUUID(),
      key: "refs-temp",
      aspects: { "temp-aspect": { weight: 0.5 } },
    });
    await waitFor(() => !!findFragmentUuidsByAspectKey(vaultDatabase, "temp-aspect").length);
    expect(
      listWarnings(vaultDatabase).filter((warning) => warning.kind === "UNKNOWN_ASPECT_KEY"),
    ).toHaveLength(0);

    // Deleting the aspect makes the key unknown again while a fragment still references it.
    // The delete commits after the rename buffer expires (~500ms), then onDeleted reconciles.
    unlinkSync(join(vaultDir, "aspects", "temp-aspect.md"));
    await waitFor(
      () =>
        listWarnings(vaultDatabase).some(
          (warning) => warning.kind === "UNKNOWN_ASPECT_KEY" && warning.aspectKey === "temp-aspect",
        ),
      3000,
    );

    const unknown = listWarnings(vaultDatabase).filter(
      (warning) => warning.kind === "UNKNOWN_ASPECT_KEY",
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ aspectKey: "temp-aspect" });
  });
});
