import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import { createVaultWatcher } from "../watcher/watcher";
import type { VaultWatcher } from "../watcher/types";
import type { VaultSyncEvent } from "@maskor/shared";
import { BASIC_VAULT } from "@maskor/test-fixtures";
import { notesTable } from "../db/vault/schema";
import { eq } from "drizzle-orm";

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
  const subscribers = new Set<(event: VaultSyncEvent) => void>();
  const emit = (event: VaultSyncEvent) => {
    for (const cb of subscribers) cb(event);
  };
  const watcher = createVaultWatcher(vaultDatabase, vault, emit, undefined, {
    onNoteRename: callbacks.onNoteRename ?? (async () => {}),
    onReferenceRename: callbacks.onReferenceRename ?? (async () => {}),
    onAspectRename: callbacks.onAspectRename ?? (async () => {}),
  });
  return {
    vault,
    vaultDatabase,
    watcher,
    subscribe: (callback: (event: VaultSyncEvent) => void): (() => void) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
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
    const existingContent = await Bun.file(join(vaultDir, "notes", "bridge observation.md")).text();
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

// --- External rename detection (unlink + add via rename buffer) ---

describe("rename buffer — note external rename", () => {
  it("fires onNoteRename when a note file is renamed on disk", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onNoteRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    renameSync(
      join(vaultDir, "notes", "bridge observation.md"),
      join(vaultDir, "notes", "bridge notes.md"),
    );

    await waitFor(() => calls.length > 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["bridge observation", "bridge notes"]);
  });
});

describe("rename buffer — reference external rename", () => {
  it("fires onReferenceRename when a reference file is renamed on disk", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onReferenceRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    renameSync(
      join(vaultDir, "references", "city research.md"),
      join(vaultDir, "references", "city notes.md"),
    );

    await waitFor(() => calls.length > 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["city research", "city notes"]);
  });
});

describe("rename buffer — aspect external rename", () => {
  it("fires onAspectRename when an aspect file is renamed on disk", async () => {
    const calls: [string, string][] = [];
    await rebuildAndWatch({
      onAspectRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    renameSync(join(vaultDir, "aspects", "grief.md"), join(vaultDir, "aspects", "sorrow.md"));

    await waitFor(() => calls.length > 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["grief", "sorrow"]);
  });
});

describe("rename buffer — true deletion", () => {
  it("removes a note from the DB after the buffer window with no rename callback", async () => {
    const calls: [string, string][] = [];
    const { vaultDatabase } = await rebuildAndWatch({
      onNoteRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    unlinkSync(join(vaultDir, "notes", "bridge observation.md"));

    // Wait longer than the 500ms rename buffer window
    await new Promise((resolve) => setTimeout(resolve, 800));

    const row = vaultDatabase
      .select({ uuid: notesTable.uuid })
      .from(notesTable)
      .where(eq(notesTable.key, "bridge observation"))
      .get();

    expect(row).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe("rename buffer — key collision", () => {
  it("allows a new note with the same key as a just-deleted note to be indexed", async () => {
    const calls: [string, string][] = [];
    const { vaultDatabase } = await rebuildAndWatch({
      onNoteRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    const newUuid = crypto.randomUUID();
    unlinkSync(join(vaultDir, "notes", "bridge observation.md"));

    // Short delay so chokidar processes the unlink and the buffer entry is set
    // before the replacement file write triggers an add event.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Write a different file to the same key slot during the buffer window
    await Bun.write(
      join(vaultDir, "notes", "bridge observation.md"),
      `---\nuuid: "${newUuid}"\n---\n\nReplacement note.\n`,
    );

    await waitFor(() => {
      const row = vaultDatabase
        .select({ uuid: notesTable.uuid })
        .from(notesTable)
        .where(eq(notesTable.key, "bridge observation"))
        .get();
      return row?.uuid === newUuid;
    });

    const row = vaultDatabase
      .select({ uuid: notesTable.uuid })
      .from(notesTable)
      .where(eq(notesTable.key, "bridge observation"))
      .get();

    expect(row?.uuid).toBe(newUuid);
    expect(calls).toHaveLength(0);
  });
});

// --- Hash guard ---

describe("syncFragment — hash guard", () => {
  it("emits no fragment:synced event when file content is unchanged on re-sync", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;

    const bridgePath = join(vaultDir, "fragments", "the-bridge.md");
    const originalContent = await Bun.file(bridgePath).text();

    // Write identical content — hash will match what's in DB from rebuild
    await Bun.write(bridgePath, originalContent);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const bridgeSynced = events.filter(
      (event) =>
        event.type === "fragment:synced" && event.uuid === "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
    );
    expect(bridgeSynced).toHaveLength(0);
  });

  it("emits fragment:synced when file content changes", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const bridgePath = join(vaultDir, "fragments", "the-bridge.md");
    const originalContent = await Bun.file(bridgePath).text();

    // Write modified content — hash will differ
    await Bun.write(bridgePath, originalContent + "\nNew line added.");

    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === "fragment:synced" &&
            event.uuid === "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
        ),
      3000,
    );

    const bridgeSynced = events.filter(
      (event) =>
        event.type === "fragment:synced" && event.uuid === "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
    );
    expect(bridgeSynced.length).toBeGreaterThanOrEqual(1);
  });
});

describe("syncNote — hash guard", () => {
  it("emits no note:synced event when file content is unchanged on re-sync", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;

    const notePath = join(vaultDir, "notes", "bridge observation.md");
    const originalContent = await Bun.file(notePath).text();

    // Write identical content — hash will match what's in DB from rebuild
    await Bun.write(notePath, originalContent);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const noteSynced = events.filter(
      (event) =>
        event.type === "note:synced" && event.uuid === "2c562d55-4f9b-4246-a2bd-89de4a860bd9",
    );
    expect(noteSynced).toHaveLength(0);
  });

  it("emits note:synced when file content changes", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const notePath = join(vaultDir, "notes", "bridge observation.md");
    const originalContent = await Bun.file(notePath).text();

    await Bun.write(notePath, originalContent + "\nNew line added.");

    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === "note:synced" && event.uuid === "2c562d55-4f9b-4246-a2bd-89de4a860bd9",
        ),
      3000,
    );

    const noteSynced = events.filter(
      (event) =>
        event.type === "note:synced" && event.uuid === "2c562d55-4f9b-4246-a2bd-89de4a860bd9",
    );
    expect(noteSynced.length).toBeGreaterThanOrEqual(1);
  });
});

describe("syncReference — hash guard", () => {
  it("emits no reference:synced event when file content is unchanged on re-sync", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;

    const referencePath = join(vaultDir, "references", "city research.md");
    const originalContent = await Bun.file(referencePath).text();

    // Write identical content — hash will match what's in DB from rebuild
    await Bun.write(referencePath, originalContent);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const referenceSynced = events.filter(
      (event) =>
        event.type === "reference:synced" && event.uuid === "abc3df51-514c-460f-b981-6f2e91965000",
    );
    expect(referenceSynced).toHaveLength(0);
  });

  it("emits reference:synced when file content changes", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const referencePath = join(vaultDir, "references", "city research.md");
    const originalContent = await Bun.file(referencePath).text();

    await Bun.write(referencePath, originalContent + "\nNew line added.");

    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === "reference:synced" &&
            event.uuid === "abc3df51-514c-460f-b981-6f2e91965000",
        ),
      3000,
    );

    const referenceSynced = events.filter(
      (event) =>
        event.type === "reference:synced" && event.uuid === "abc3df51-514c-460f-b981-6f2e91965000",
    );
    expect(referenceSynced.length).toBeGreaterThanOrEqual(1);
  });
});

describe("watcher — swap files are ignored under .maskor/", () => {
  it("does not emit any events when a swap file is written under .maskor/swap/", async () => {
    const { default: nodeFs } = await import("node:fs/promises");
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const swapDir = join(vaultDir, ".maskor", "swap", "fragment");
    await nodeFs.mkdir(swapDir, { recursive: true });
    await Bun.write(
      join(swapDir, "test-uuid.json"),
      JSON.stringify({ content: "swap body", savedAt: new Date().toISOString() }),
    );

    // Wait longer than chokidar's awaitWriteFinish stability threshold (200ms).
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(events).toHaveLength(0);
  });
});
