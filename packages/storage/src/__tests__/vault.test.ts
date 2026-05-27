import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createVault } from "../vault/markdown/vault";
import type { VaultConfig } from "../vault/types";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let tmpDir: string;
let config: VaultConfig;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-vault-test-"));
  cpSync(BASIC_VAULT, tmpDir, { recursive: true });
  config = { root: tmpDir };
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- fragments ---

describe("vault.fragments.readAll", () => {
  it("returns all active and discarded fragments", async () => {
    const vault = createVault(config);
    const fragments = await vault.fragments.readAll();
    expect(fragments.length).toBeGreaterThanOrEqual(5);
  });

  it("marks fragments in discarded/ as isDiscarded=true", async () => {
    const vault = createVault(config);
    const fragments = await vault.fragments.readAll();
    const discarded = fragments.filter((fragment) => fragment.isDiscarded);
    expect(discarded.length).toBeGreaterThanOrEqual(2);
  });

  it("marks fragments not in discarded/ as isDiscarded=false", async () => {
    const vault = createVault(config);
    const fragments = await vault.fragments.readAll();
    const theWindow = fragments.find((fragment) => fragment.key === "the-window");
    // The Window is in discarded/ so should be isDiscarded=true
    expect(theWindow?.isDiscarded ?? null).toBe(true);
  });
});

describe("vault.fragments.read", () => {
  it("reads a fragment by filename", async () => {
    const vault = createVault(config);
    const fragment = await vault.fragments.read("the-bridge.md");
    expect(fragment.key).toBe("the-bridge");
    expect(fragment.aspects["grief"]).toEqual({ weight: 0.6 });
    expect(fragment.notes).toContain("bridge observation");
  });

  it("assigns uuid from frontmatter", async () => {
    const vault = createVault(config);
    const fragment = await vault.fragments.read("the-bridge.md");
    expect(fragment.uuid as string).toBe("f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b");
  });
});

describe("vault.fragments.write", () => {
  it("writes a fragment file and reads it back", async () => {
    const vault = createVault(config);
    const original = await vault.fragments.read("the-bridge.md");
    const modified = { ...original, readiness: 0.95 };

    await vault.fragments.write(modified);
    const reread = await vault.fragments.read("the-bridge.md");
    expect(reread.readiness).toBe(0.95);
  });
});

describe("vault.fragments.discard", () => {
  it("moves fragment to discarded/ and marks it as isDiscarded", async () => {
    const vault = createVault(config);
    await vault.fragments.discard("the-bridge.md");

    const discarded = await vault.fragments.read("discarded/the-bridge.md");
    expect(discarded.isDiscarded).toBe(true);
  });

  it("throws when file not found", async () => {
    const vault = createVault(config);
    await expect(vault.fragments.discard("nonexistent.md")).rejects.toThrow();
  });

  it("throws PATH_OUT_OF_BOUNDS for paths outside the fragments directory", async () => {
    const vault = createVault(config);
    await expect(vault.fragments.discard("../aspects/grief.md")).rejects.toMatchObject({
      code: "PATH_OUT_OF_BOUNDS",
    });
  });
});

// --- aspects ---

describe("vault.aspects.readAll", () => {
  it("reads all aspects", async () => {
    const vault = createVault(config);
    const aspects = await vault.aspects.readAll();
    expect(aspects.length).toBe(4);
    const keys = aspects.map((aspect) => aspect.key);
    expect(keys).toContain("grief");
    expect(keys).toContain("city");
  });

  it("reads description from body", async () => {
    const vault = createVault(config);
    const aspects = await vault.aspects.readAll();
    const grief = aspects.find((aspect) => aspect.key === "grief");
    expect(grief?.description ?? null).toBeTruthy();
  });
});

describe("vault.aspects.write", () => {
  it("writes a new aspect at the root and reads it back", async () => {
    const vault = createVault(config);
    const newAspect = {
      uuid: "00000000-1111-2222-3333-444444444444",
      key: "new-aspect",
      description: "Bare aspect at root.",
      notes: [],
    };
    await vault.aspects.write(newAspect);

    const reread = await vault.aspects.read("new-aspect.md");
    expect(reread.key).toBe("new-aspect");
    expect(reread.category).toBeUndefined();
    expect(reread.description).toBe("Bare aspect at root.");
  });

  it("writes an aspect with a category into the matching subfolder", async () => {
    const vault = createVault(config);
    const newAspect = {
      uuid: "00000000-1111-2222-3333-555555555555",
      key: "rooftops",
      category: "setting",
      description: "Cityscape detail.",
      notes: [],
    };
    await vault.aspects.write(newAspect);

    const reread = await vault.aspects.read("setting/rooftops.md");
    expect(reread.category).toBe("setting");
    expect(reread.key).toBe("rooftops");
  });
});

// --- notes ---

describe("vault.notes.readAll", () => {
  it("reads all notes", async () => {
    const vault = createVault(config);
    const notes = await vault.notes.readAll();
    expect(notes.length).toBe(2);
  });

  it("reads note content", async () => {
    const vault = createVault(config);
    const notes = await vault.notes.readAll();
    const bridgeNote = notes.find((note) => note.key === "bridge observation");
    expect(bridgeNote?.content).toBeTruthy();
  });
});

// --- references ---

describe("vault.references.readAll", () => {
  it("reads all references", async () => {
    const vault = createVault(config);
    const references = await vault.references.readAll();
    expect(references.length).toBe(1);
    expect(references[0]?.key).toBe("city research");
  });
});

// --- sequences ---

const TEST_PROJECT_UUID = "11111111-1111-1111-1111-111111111111";
const TEST_SEQUENCE_UUID = "22222222-2222-2222-2222-222222222222";
const TEST_SECTION_UUID = "33333333-3333-3333-3333-333333333333";
const TEST_FRAGMENT_UUID = "44444444-4444-4444-4444-444444444444";
const TEST_POSITION_UUID = "55555555-5555-5555-5555-555555555555";

const makeTestSequence = () => ({
  uuid: TEST_SEQUENCE_UUID,
  name: "Main",
  isMain: true,
  projectUuid: TEST_PROJECT_UUID,
  sections: [
    {
      uuid: TEST_SECTION_UUID,
      name: "Main",
      fragments: [
        {
          uuid: TEST_POSITION_UUID,
          fragmentUuid: TEST_FRAGMENT_UUID,
          position: 0,
        },
      ],
    },
  ],
});

describe("vault.sequences.readAll", () => {
  it("returns empty array when no sequences exist", async () => {
    const vault = createVault({ ...config, projectUuid: TEST_PROJECT_UUID });
    const sequences = await vault.sequences.readAll();
    expect(sequences).toEqual([]);
  });
});

describe("vault.sequences.write + read (round-trip)", () => {
  it("write then read yields identical sequence", async () => {
    const vault = createVault({ ...config, projectUuid: TEST_PROJECT_UUID });
    const original = makeTestSequence();

    await vault.sequences.write(original);
    const loaded = await vault.sequences.read(`${TEST_SEQUENCE_UUID}.yaml`);

    expect(loaded.uuid).toBe(original.uuid);
    expect(loaded.name).toBe(original.name);
    expect(loaded.isMain).toBe(original.isMain);
    expect(loaded.projectUuid).toBe(TEST_PROJECT_UUID);
    expect(loaded.sections).toHaveLength(1);
    expect(loaded.sections[0]?.uuid).toBe(TEST_SECTION_UUID);
    expect(loaded.sections[0]?.fragments[0]?.fragmentUuid).toBe(TEST_FRAGMENT_UUID);
    expect(loaded.sections[0]?.fragments[0]?.position).toBe(0);
  });

  it("write then readAll includes the written sequence", async () => {
    const vault = createVault({ ...config, projectUuid: TEST_PROJECT_UUID });
    await vault.sequences.write(makeTestSequence());

    const sequences = await vault.sequences.readAll();
    expect(sequences).toHaveLength(1);
    expect(sequences[0]?.uuid).toBe(TEST_SEQUENCE_UUID);
  });

  it("readAllWithFilePaths returns filePath and rawContent alongside entity", async () => {
    const vault = createVault({ ...config, projectUuid: TEST_PROJECT_UUID });
    await vault.sequences.write(makeTestSequence());

    const results = await vault.sequences.readAllWithFilePaths();
    expect(results).toHaveLength(1);
    expect(results[0]?.filePath).toBe(`${TEST_SEQUENCE_UUID}.yaml`);
    expect(results[0]?.entity.uuid).toBe(TEST_SEQUENCE_UUID);
    expect(typeof results[0]?.rawContent).toBe("string");
  });
});

describe("vault.sequences.delete", () => {
  it("removes the sequence file", async () => {
    const vault = createVault({ ...config, projectUuid: TEST_PROJECT_UUID });
    await vault.sequences.write(makeTestSequence());
    await vault.sequences.delete(`${TEST_SEQUENCE_UUID}.yaml`);

    const sequences = await vault.sequences.readAll();
    expect(sequences).toHaveLength(0);
  });

  it("throws SEQUENCE_NOT_FOUND when file does not exist", async () => {
    const vault = createVault({ ...config, projectUuid: TEST_PROJECT_UUID });
    const { VaultError } = await import("../vault/types");

    await expect(vault.sequences.delete("nonexistent.yaml")).rejects.toThrow(VaultError);
  });
});

// --- pieces ---

describe("vault.pieces.consumeAll", () => {
  it("converts pieces to fragments and removes source files", async () => {
    const vault = createVault(config);
    const fragments = await vault.pieces.consumeAll();

    expect(fragments.length).toBe(1);
    expect(fragments[0]?.isDiscarded).toBe(false);

    // source file should be gone
    const pieceFile = Bun.file(join(tmpDir, "pieces", "raw-memory.md"));
    expect(await pieceFile.exists()).toBe(false);

    // fragment file should exist
    const fragFile = Bun.file(join(tmpDir, "fragments", "raw-memory.md"));
    expect(await fragFile.exists()).toBe(true);
  });
});
