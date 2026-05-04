import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import { createVaultWatcher } from "../watcher/watcher";
import type { VaultWatcher } from "../watcher/watcher";
import type { VaultSyncEvent } from "@maskor/shared";
import { BASIC_VAULT } from "@maskor/test-fixtures";

// Chokidar awaitWriteFinish.stabilityThreshold is 200ms; poll until callback fires
// or time out after 2s.
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
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-watcher-test-"));
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

const makeWatcher = (callbacks: {
  onNoteRename?: (oldKey: string, newKey: string) => Promise<void>;
  onReferenceRename?: (oldKey: string, newKey: string) => Promise<void>;
  onAspectRename?: (oldKey: string, newKey: string) => Promise<void>;
}) => {
  const vault = createVault({ root: vaultDir });
  const vaultDatabase = createVaultDatabase(vaultDir);
  return {
    vault,
    vaultDatabase,
    watcher: createVaultWatcher(vaultDatabase, vault, undefined, {
      onNoteRename: callbacks.onNoteRename ?? (async () => {}),
      onReferenceRename: callbacks.onReferenceRename ?? (async () => {}),
      onAspectRename: callbacks.onAspectRename ?? (async () => {}),
    }),
  };
};

const WATCHER_READY_DELAY_MS = 300;

const rebuildAndWatch = async (
  callbacks: Parameters<typeof makeWatcher>[0],
): Promise<ReturnType<typeof makeWatcher>> => {
  const made = makeWatcher(callbacks);
  const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
  await indexer.rebuild();
  made.watcher.start();
  watcher = made.watcher;
  // Give chokidar time to finish setting up watchers before writing test files.
  await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));
  return made;
};

// --- Rename detection ---

describe("syncNote — rename detection", () => {
  it("calls onNoteRename when a note file is renamed to a new key", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onNoteRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    // Write a new file using the same UUID as "bridge observation" but with a new name
    await Bun.write(
      join(vaultDir, "notes", "bridge notes.md"),
      '---\nuuid: "2c562d55-4f9b-4246-a2bd-89de4a860bd9"\n---\n\nUpdated content.\n',
    );

    await waitFor(() => calls.length > 0);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["bridge observation", "bridge notes"]);
  });

  it("does not call onNoteRename for a first-time sync (UUID not yet in DB)", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onNoteRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    await Bun.write(
      join(vaultDir, "notes", "brand new note.md"),
      `---\nuuid: "${crypto.randomUUID()}"\n---\n\nBrand new.\n`,
    );

    // Wait long enough for the event to fire if it were going to
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(calls).toHaveLength(0);
  });

  it("does not call onNoteRename when the key is unchanged on re-sync", async () => {
    const calls: [string, string][] = [];
    const { vaultDatabase } = await rebuildAndWatch({
      onNoteRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    // Re-write "bridge observation.md" with the same UUID and same filename stem
    const existingContent = await Bun.file(
      join(vaultDir, "notes", "bridge observation.md"),
    ).text();
    await Bun.write(join(vaultDir, "notes", "bridge observation.md"), existingContent + " ");

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(calls).toHaveLength(0);

    void vaultDatabase; // used above via rebuildAndWatch
  });
});

describe("syncReference — rename detection", () => {
  it("calls onReferenceRename when a reference file is renamed to a new key", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onReferenceRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    await Bun.write(
      join(vaultDir, "references", "city notes.md"),
      '---\nuuid: "abc3df51-514c-460f-b981-6f2e91965000"\n---\n\nRenamed.\n',
    );

    await waitFor(() => calls.length > 0);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["city research", "city notes"]);
  });
});

describe("syncAspect — rename detection", () => {
  it("calls onAspectRename when an aspect file is renamed to a new key", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onAspectRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    await Bun.write(
      join(vaultDir, "aspects", "sorrow.md"),
      '---\nuuid: "51e530a1-d980-438c-8b1d-cf8101fef75a"\nnotes: []\n---\n\nRenamed aspect.\n',
    );

    await waitFor(() => calls.length > 0);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["grief", "sorrow"]);
  });
});

// --- Hash guard ---

describe("syncFragment — hash guard", () => {
  it("emits no fragment:synced event when file content is unchanged on re-sync", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.watcher.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;

    const bridgePath = join(vaultDir, "fragments", "the-bridge.md");
    const originalContent = await Bun.file(bridgePath).text();

    // Write identical content — hash will match what's in DB from rebuild
    await Bun.write(bridgePath, originalContent);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const bridgeSynced = events.filter(
      (event) => event.type === "fragment:synced" && event.uuid === "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
    );
    expect(bridgeSynced).toHaveLength(0);
  });

  it("emits fragment:synced when file content changes", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.watcher.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;

    const bridgePath = join(vaultDir, "fragments", "the-bridge.md");
    const originalContent = await Bun.file(bridgePath).text();

    // Write modified content — hash will differ
    await Bun.write(bridgePath, originalContent + "\nNew line added.");

    await waitFor(() =>
      events.some(
        (event) =>
          event.type === "fragment:synced" &&
          event.uuid === "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
      ),
    );

    const bridgeSynced = events.filter(
      (event) =>
        event.type === "fragment:synced" &&
        event.uuid === "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
    );
    expect(bridgeSynced.length).toBeGreaterThanOrEqual(1);
  });
});
