import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let tmpDir: string;
let vaultDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-indexer-test-"));
  vaultDir = join(tmpDir, "vault");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeIndexer = () => {
  const vault = createVault({ root: vaultDir });
  const vaultDatabase = createVaultDatabase(vaultDir);
  return createVaultIndexer(vaultDatabase, vault);
};

// --- rebuild ---

describe("rebuild", () => {
  it("returns correct counts for fixture vault", async () => {
    const indexer = makeIndexer();
    const stats = await indexer.rebuild();

    expect(stats.fragments).toBe(5); // 3 active + 2 discarded
    expect(stats.aspects).toBe(4);
    expect(stats.notes).toBe(2);
    expect(stats.references).toBe(1);
    expect(stats.durationMs).toBeGreaterThan(0);
  });

  it("produces no warnings for fixture vault (all aspect keys are valid)", async () => {
    const indexer = makeIndexer();
    const stats = await indexer.rebuild();
    expect(stats.warnings).toHaveLength(0);
  });

  it("is idempotent — second rebuild produces same counts", async () => {
    const indexer = makeIndexer();
    const first = await indexer.rebuild();
    const second = await indexer.rebuild();

    expect(second.fragments).toBe(first.fragments);
    expect(second.aspects).toBe(first.aspects);
    expect(second.notes).toBe(first.notes);
    expect(second.references).toBe(first.references);
    expect(second.warnings).toHaveLength(0);
  });

  it("emits UNKNOWN_ASPECT_KEY warning when a fragment references a missing aspect key", async () => {
    // Write a fragment that references an aspect key that doesn't exist in aspects/
    const vault = createVault({ root: vaultDir });
    const fragments = await vault.fragments.readAll();
    const bridge = fragments.find((fragment) => fragment.title === "The Bridge")!;

    const modified = {
      ...bridge,
      properties: {
        ...bridge.properties,
        "nonexistent-aspect": { weight: 0.5 },
      },
    };
    await vault.fragments.write(modified);

    const vaultDatabase = createVaultDatabase(vaultDir);
    const indexer = createVaultIndexer(vaultDatabase, vault);
    const stats = await indexer.rebuild();

    expect(stats.warnings).toHaveLength(1);
    expect(stats.warnings[0]?.kind).toBe("UNKNOWN_ASPECT_KEY");
    expect(stats.warnings[0]?.aspectKey).toBe("nonexistent-aspect");
    expect(stats.warnings[0]?.fragmentUuids).toContain(bridge.uuid);
  });
});

// --- fragments.findAll ---

describe("fragments.findAll", () => {
  it("returns all active (non-deleted) fragments after rebuild", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const fragments = await indexer.fragments.findAll();
    // All 5 fragments are in the vault (none deleted from FS), so all 5 should be returned
    expect(fragments.length).toBe(5);
  });

  it("includes notes, references and properties on each fragment", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const fragments = await indexer.fragments.findAll();
    const bridge = fragments.find((fragment) => fragment.title === "The Bridge");

    expect(bridge).toBeDefined();
    expect(bridge?.notes).toContain("bridge observation");
    expect(bridge?.references).toContain("city research");
    expect(bridge?.properties["grief"]).toBeDefined();
    expect(bridge?.properties["grief"]?.weight).toBe(0.6);
  });
});

// --- fragments.findByUUID ---

describe("fragments.findByUUID", () => {
  it("returns the correct fragment by UUID", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const bridge = await indexer.fragments.findByUUID("f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b");

    expect(bridge).not.toBeNull();
    expect(bridge?.title).toBe("The Bridge");
    expect(bridge?.isDiscarded).toBe(false);
    expect(bridge?.readyStatus).toBe(0.58);
  });

  it("returns null for unknown UUID", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const result = await indexer.fragments.findByUUID("nonexistent");
    expect(result).toBeNull();
  });
});

// --- fragments.findFilePath ---

describe("fragments.findFilePath", () => {
  it("returns the file path for a known fragment", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const filePath = await indexer.fragments.findFilePath("f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b");

    expect(filePath).not.toBeNull();
    expect(filePath).toContain("the-bridge.md");
  });

  it("returns null for unknown UUID", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const filePath = await indexer.fragments.findFilePath("nonexistent");
    expect(filePath).toBeNull();
  });
});

// --- aspects ---

describe("aspects.findAll", () => {
  it("returns all aspects after rebuild", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const aspects = await indexer.aspects.findAll();
    expect(aspects.length).toBe(4);
    expect(aspects.map((aspect) => aspect.key)).toContain("grief");
    expect(aspects.map((aspect) => aspect.key)).toContain("city");
  });
});

describe("aspects.findByKey", () => {
  it("returns the correct aspect by key", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const grief = await indexer.aspects.findByKey("grief");
    expect(grief).not.toBeNull();
    expect(grief?.category).toBe("theme");
  });

  it("returns null for unknown key", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    expect(await indexer.aspects.findByKey("nonexistent")).toBeNull();
  });
});

// --- notes ---

describe("notes.findAll", () => {
  it("returns all notes after rebuild", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const notes = await indexer.notes.findAll();
    expect(notes.length).toBe(2);
  });
});

describe("notes.findByKey", () => {
  it("returns the correct note by key", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const note = await indexer.notes.findByKey("bridge observation");
    expect(note).not.toBeNull();
    expect(note?.filePath).toContain("bridge-observation.md");
  });

  it("returns null for unknown key", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    expect(await indexer.notes.findByKey("nonexistent")).toBeNull();
  });
});

// --- references ---

describe("references.findAll", () => {
  it("returns all references after rebuild", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const refs = await indexer.references.findAll();
    expect(refs.length).toBe(1);
    expect(refs[0]?.key).toBe("city research");
  });
});

describe("references.findByKey", () => {
  it("returns the correct reference by key", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const cityResearch = await indexer.references.findByKey("city research");
    expect(cityResearch).not.toBeNull();
    expect(cityResearch?.filePath).toContain("city-research.md");
  });
});

// --- hard-delete on rebuild ---

describe("hard-delete on rebuild", () => {
  it("removes a fragment that was deleted from the vault between rebuilds", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const bridgeUuid = "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b";
    expect(await indexer.fragments.findByUUID(bridgeUuid)).not.toBeNull();

    unlinkSync(join(vaultDir, "fragments", "the-bridge.md"));

    await indexer.rebuild();

    expect(await indexer.fragments.findByUUID(bridgeUuid)).toBeNull();
    expect(await indexer.fragments.findFilePath(bridgeUuid)).toBeNull();
  });

  it("removes an aspect that was deleted from the vault between rebuilds", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    expect(await indexer.aspects.findByKey("grief")).not.toBeNull();

    unlinkSync(join(vaultDir, "aspects", "grief.md"));
    await indexer.rebuild();

    expect(await indexer.aspects.findByKey("grief")).toBeNull();
  });
});

// --- relation isolation ---

describe("fragments.findAll relation isolation", () => {
  it("does not return notes from one fragment on another fragment", async () => {
    const indexer = makeIndexer();
    await indexer.rebuild();

    const fragments = await indexer.fragments.findAll();
    const bridge = fragments.find((fragment) => fragment.title === "The Bridge")!;
    const otherFragments = fragments.filter((fragment) => fragment.title !== "The Bridge");

    // Notes listed on bridge should not appear on any other fragment
    for (const note of bridge.notes) {
      for (const other of otherFragments) {
        expect(other.notes).not.toContain(note);
      }
    }
  });
});

// --- StorageService integration ---

describe("StorageService integration", () => {
  it("service.index.rebuild returns correct stats and fragments are queryable", async () => {
    const { createStorageService } = await import("../service/storage-service");

    const configDir = join(tmpDir, "config");
    const service = createStorageService({ configDirectory: configDir });

    const record = await service.registerProject("Test", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    const stats = await service.index.rebuild(context);

    expect(stats.fragments).toBe(5);

    const fragments = await service.fragments.readAll(context);
    expect(fragments.length).toBe(5);
  });

  it("repeated rebuild calls use the same cached indexer", async () => {
    const { createStorageService } = await import("../service/storage-service");

    const configDir = join(tmpDir, "config");
    const service = createStorageService({ configDirectory: configDir });

    const record = await service.registerProject("Test", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    const firstStats = await service.index.rebuild(context);
    const secondStats = await service.index.rebuild(context);
    expect(firstStats.fragments).toBe(secondStats.fragments);
  });
});
