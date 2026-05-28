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
import { aspectsTable, notesTable, fragmentsTable } from "../db/vault/schema";
import { parseFile } from "../vault/markdown/parse";
import { eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";

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

    renameSync(
      join(vaultDir, "aspects", "theme", "grief.md"),
      join(vaultDir, "aspects", "theme", "sorrow.md"),
    );

    await waitFor(() => calls.length > 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["grief", "sorrow"]);
  });
});

describe("syncAspect — external folder move", () => {
  it("updates DB filePath without calling cascadeRename when an aspect file moves between subfolders", async () => {
    const calls: [string, string][] = [];
    const { vaultDatabase } = await rebuildAndWatch({
      onAspectRename: async (oldKey, newKey) => {
        calls.push([oldKey, newKey]);
      },
    });

    const oldPath = join(vaultDir, "aspects", "theme", "grief.md");
    const newDir = join(vaultDir, "aspects", "feelings");
    const newPath = join(newDir, "grief.md");
    mkdirSync(newDir, { recursive: true });
    renameSync(oldPath, newPath);

    await waitFor(() => {
      const row = vaultDatabase
        .select({ filePath: aspectsTable.filePath })
        .from(aspectsTable)
        .where(eq(aspectsTable.key, "grief"))
        .get();
      return row?.filePath === "feelings/grief.md";
    });

    // The same key under a new category must not trigger a cascade rename of
    // fragment frontmatter — key did not change.
    expect(calls).toHaveLength(0);

    const row = vaultDatabase
      .select({ uuid: aspectsTable.uuid, filePath: aspectsTable.filePath })
      .from(aspectsTable)
      .where(eq(aspectsTable.key, "grief"))
      .get();
    expect(row?.uuid).toBe("51e530a1-d980-438c-8b1d-cf8101fef75a");
    expect(row?.filePath).toBe("feelings/grief.md");
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

describe("syncAspect — revival after rename-buffer expiry", () => {
  it("re-adds the same UUID at the same path after the buffer expires and emits revived: true", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const griefPath = join(vaultDir, "aspects", "theme", "grief.md");
    const griefContent = await Bun.file(griefPath).text();

    unlinkSync(griefPath);
    // Wait past the 500ms rename buffer window so the row is hard-deleted.
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(
      made.vaultDatabase
        .select({ uuid: aspectsTable.uuid })
        .from(aspectsTable)
        .where(eq(aspectsTable.key, "grief"))
        .get(),
    ).toBeUndefined();

    await Bun.write(griefPath, griefContent);

    await waitFor(() =>
      events.some(
        (event) => event.type === "aspect:synced" && (event as { revived?: boolean }).revived,
      ),
    );

    const row = made.vaultDatabase
      .select({ uuid: aspectsTable.uuid, filePath: aspectsTable.filePath })
      .from(aspectsTable)
      .where(eq(aspectsTable.key, "grief"))
      .get();
    expect(row?.uuid).toBe("51e530a1-d980-438c-8b1d-cf8101fef75a");
    expect(row?.filePath).toBe("theme/grief.md");
  });

  it("revives at a different path within the same entity-type root", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const griefPath = join(vaultDir, "aspects", "theme", "grief.md");
    const griefContent = await Bun.file(griefPath).text();

    unlinkSync(griefPath);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const newDir = join(vaultDir, "aspects", "emotions");
    mkdirSync(newDir, { recursive: true });
    await Bun.write(join(newDir, "grief.md"), griefContent);

    await waitFor(() => {
      const row = made.vaultDatabase
        .select({ filePath: aspectsTable.filePath })
        .from(aspectsTable)
        .where(eq(aspectsTable.key, "grief"))
        .get();
      return row?.filePath === "emotions/grief.md";
    });

    const revivedEvent = events.find(
      (event) => event.type === "aspect:synced" && (event as { revived?: boolean }).revived,
    );
    expect(revivedEvent).toBeTruthy();

    const row = made.vaultDatabase
      .select({ uuid: aspectsTable.uuid, filePath: aspectsTable.filePath })
      .from(aspectsTable)
      .where(eq(aspectsTable.key, "grief"))
      .get();
    expect(row?.uuid).toBe("51e530a1-d980-438c-8b1d-cf8101fef75a");
    expect(row?.filePath).toBe("emotions/grief.md");
  });

  it("cross-entity-type return: aspect file lands in notes/ — note created (revival flag not set), aspect row gone", async () => {
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const griefPath = join(vaultDir, "aspects", "theme", "grief.md");
    const griefContent = await Bun.file(griefPath).text();

    unlinkSync(griefPath);
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(
      made.vaultDatabase
        .select({ uuid: aspectsTable.uuid })
        .from(aspectsTable)
        .where(eq(aspectsTable.key, "grief"))
        .get(),
    ).toBeUndefined();

    await Bun.write(join(vaultDir, "notes", "grief.md"), griefContent);

    await waitFor(() => {
      const row = made.vaultDatabase
        .select({ uuid: notesTable.uuid })
        .from(notesTable)
        .where(eq(notesTable.key, "grief"))
        .get();
      return row !== undefined;
    });

    const noteRow = made.vaultDatabase
      .select({ uuid: notesTable.uuid })
      .from(notesTable)
      .where(eq(notesTable.key, "grief"))
      .get();
    // Identity preserved across the type boundary (UUID came from frontmatter)
    // but the note entity is conceptually new — the aspect-side recently-deleted
    // tracker is not consulted by the notes sync path, so `revived` is not set.
    expect(noteRow?.uuid).toBe("51e530a1-d980-438c-8b1d-cf8101fef75a");

    const noteRevivedEvent = events.find(
      (event) =>
        event.type === "note:synced" &&
        event.uuid === "51e530a1-d980-438c-8b1d-cf8101fef75a" &&
        (event as { revived?: boolean }).revived,
    );
    expect(noteRevivedEvent).toBeUndefined();

    // The aspect row is gone — fragments that referenced it as an aspect key
    // will surface UNKNOWN_ASPECT_KEY warnings on the next rebuild.
    expect(
      made.vaultDatabase
        .select({ uuid: aspectsTable.uuid })
        .from(aspectsTable)
        .where(eq(aspectsTable.key, "grief"))
        .get(),
    ).toBeUndefined();
  });
});

// --- Fragment adoption (raw .md drop) ---

describe("syncFragment — raw drop adoption", () => {
  it("adopts a body-only .md drop: mints uuid, writes full frontmatter, indexes, emits fragment:synced", async () => {
    const events: VaultSyncEvent[] = [];
    const { watcher: w, vaultDatabase, subscribe } = await rebuildAndWatch({});
    watcher = w;
    subscribe((event) => events.push(event));

    await Bun.write(
      join(vaultDir, "fragments", "raw-drop-plain.md"),
      "She crossed it every morning.\n",
    );

    await waitFor(() => events.some((e) => e.type === "fragment:synced"));

    const raw = await Bun.file(join(vaultDir, "fragments", "raw-drop-plain.md")).text();
    const parsed = parseFile(raw);

    expect(typeof parsed.frontmatter.uuid).toBe("string");
    expect(parsed.frontmatter.readiness).toBe(0);
    expect(Array.isArray(parsed.frontmatter.notes)).toBe(true);
    expect(Array.isArray(parsed.frontmatter.references)).toBe(true);
    expect(typeof parsed.frontmatter.updatedAt).toBe("string");

    const row = vaultDatabase
      .select({ uuid: fragmentsTable.uuid, key: fragmentsTable.key })
      .from(fragmentsTable)
      .where(eq(fragmentsTable.key, "raw-drop-plain"))
      .get();
    expect(row?.uuid).toBe(parsed.frontmatter.uuid as string);
    expect(row?.key).toBe("raw-drop-plain");
  });

  it("preserves user-supplied readiness when adopting a partial-frontmatter drop", async () => {
    const events: VaultSyncEvent[] = [];
    const { watcher: w, vaultDatabase, subscribe } = await rebuildAndWatch({});
    watcher = w;
    subscribe((event) => events.push(event));

    await Bun.write(
      join(vaultDir, "fragments", "raw-drop-partial.md"),
      "---\nreadiness: 0.5\n---\n\nThe cold had a particular quality.\n",
    );

    await waitFor(() => events.some((e) => e.type === "fragment:synced"));

    const raw = await Bun.file(join(vaultDir, "fragments", "raw-drop-partial.md")).text();
    const parsed = parseFile(raw);

    expect(parsed.frontmatter.readiness).toBe(0.5);
    expect(typeof parsed.frontmatter.uuid).toBe("string");
    expect(Array.isArray(parsed.frontmatter.notes)).toBe(true);
    expect(Array.isArray(parsed.frontmatter.references)).toBe(true);

    const row = vaultDatabase
      .select({ readiness: fragmentsTable.readiness })
      .from(fragmentsTable)
      .where(eq(fragmentsTable.key, "raw-drop-partial"))
      .get();
    expect(row?.readiness).toBe(0.5);
  });

  it("leaves file untouched when dropped .md already has a uuid", async () => {
    const events: VaultSyncEvent[] = [];
    const { watcher: w, subscribe } = await rebuildAndWatch({});
    watcher = w;
    subscribe((event) => events.push(event));

    const existingUuid = crypto.randomUUID();
    const originalContent = `---\nuuid: "${existingUuid}"\nreadiness: 0\nnotes: []\nreferences: []\nupdatedAt: "2026-01-01T00:00:00.000Z"\n---\n\nExisting content.\n`;
    await Bun.write(join(vaultDir, "fragments", "raw-drop-canonical.md"), originalContent);

    await waitFor(() => events.some((e) => e.type === "fragment:synced"));

    const raw = await Bun.file(join(vaultDir, "fragments", "raw-drop-canonical.md")).text();
    expect(raw).toBe(originalContent);
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

describe("syncFragment — nested fragment rejection", () => {
  it("skips a fragment dropped into a non-discarded subfolder under fragments/", async () => {
    const { fragmentsTable } = await import("../db/vault/schema");
    const events: VaultSyncEvent[] = [];
    const made = makeWatcher({});
    const indexer = createVaultIndexer(made.vaultDatabase, made.vault);
    await indexer.rebuild();

    made.subscribe((event) => events.push(event));
    made.watcher.start();
    watcher = made.watcher;
    await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY_MS));

    const nestedDir = join(vaultDir, "fragments", "chapter-1");
    mkdirSync(nestedDir, { recursive: true });
    await Bun.write(
      join(nestedDir, "intro.md"),
      '---\nuuid: "00000000-0000-0000-0000-000000000abc"\n---\n\nNested fragment body.\n',
    );

    await new Promise((resolve) => setTimeout(resolve, 600));

    const row = made.vaultDatabase
      .select({ uuid: fragmentsTable.uuid })
      .from(fragmentsTable)
      .where(eq(fragmentsTable.key, "intro"))
      .get();

    expect(row).toBeUndefined();
    expect(events.filter((event) => event.type === "fragment:synced")).toHaveLength(0);
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
