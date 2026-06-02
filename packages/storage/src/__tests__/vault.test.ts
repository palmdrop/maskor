import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Logger } from "@maskor/shared/logger";
import { createVault } from "../vault/markdown/vault";
import type { VaultConfig } from "../vault/types";
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
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

describe("vault.fragments — unmanaged frontmatter preservation", () => {
  it("preserves user frontmatter keys and drops a legacy notes attachment across a write", async () => {
    const vault = createVault(config);
    // A hand-authored fragment carrying both a legacy `notes:` attachment and user-owned Obsidian
    // keys that Maskor does not manage.
    writeFileSync(
      join(tmpDir, "fragments", "hand-authored.md"),
      [
        "---",
        'uuid: "abcdabcd-0000-0000-0000-00000000abcd"',
        "readiness: 0.3",
        "notes:",
        "  - legacy attachment",
        "tags:",
        "  - wip",
        "  - draft",
        'aliases: "Working Title"',
        "---",
        "",
        "Body text.",
        "",
      ].join("\n"),
    );

    const fragment = await vault.fragments.read("hand-authored.md");
    expect("notes" in fragment).toBe(false);
    expect(fragment.extraFrontmatter).toEqual({ tags: ["wip", "draft"], aliases: "Working Title" });

    // Round-trip through a Maskor write: the legacy notes list is gone, user keys survive.
    await vault.fragments.write({ ...fragment, content: "Edited body." });
    const onDisk = readFileSync(join(tmpDir, "fragments", "hand-authored.md"), "utf8");
    expect(onDisk).not.toContain("legacy attachment");
    expect(onDisk).toContain("tags:");
    expect(onDisk).toContain("aliases:");

    const reread = await vault.fragments.read("hand-authored.md");
    expect(reread.extraFrontmatter).toEqual({ tags: ["wip", "draft"], aliases: "Working Title" });
  });
});

describe("vault.fragments.read", () => {
  it("reads a fragment by filename", async () => {
    const vault = createVault(config);
    const fragment = await vault.fragments.read("the-bridge.md");
    expect(fragment.key).toBe("the-bridge");
    expect(fragment.aspects["grief"]).toEqual({ weight: 0.6 });
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
  active: true,
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

    const { entities, failures } = await vault.sequences.readAllWithFilePaths();
    expect(failures).toHaveLength(0);
    expect(entities).toHaveLength(1);
    expect(entities[0]?.filePath).toBe(`${TEST_SEQUENCE_UUID}.yaml`);
    expect(entities[0]?.entity.uuid).toBe(TEST_SEQUENCE_UUID);
    expect(typeof entities[0]?.rawContent).toBe("string");
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

// --- listing a vault whose dirs do not yet exist (fresh adoption) ---

describe("vault listing — missing directories", () => {
  const makeSpyLogger = () => {
    const error = mock(() => {});
    const logger = {
      info: () => {},
      warn: () => {},
      error,
      debug: () => {},
      child: () => logger,
    } as unknown as Logger;
    return { logger, error };
  };

  it("returns [] and logs no error when .maskor/sequences is absent", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "maskor-empty-vault-"));
    try {
      const { logger, error } = makeSpyLogger();
      const vault = createVault({ root: emptyDir, logger, projectUuid: TEST_PROJECT_UUID });
      expect(await vault.sequences.readAll()).toEqual([]);
      expect(error).not.toHaveBeenCalled();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("returns [] and logs no error when entity dirs are absent", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "maskor-empty-vault-"));
    try {
      const { logger, error } = makeSpyLogger();
      const vault = createVault({ root: emptyDir, logger });
      expect(await vault.aspects.readAll()).toEqual([]);
      expect(await vault.notes.readAll()).toEqual([]);
      expect(await vault.references.readAll()).toEqual([]);
      expect(await vault.fragments.readAll()).toEqual([]);
      expect(error).not.toHaveBeenCalled();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// --- adoption is opt-in: readAllWithFilePaths stays a pure read unless { adopt: true } ---

describe("vault readAllWithFilePaths — adopt gating", () => {
  // Unique body content per fixture — good hygiene now that parseFile shallow-copies frontmatter
  // (see parse.test.ts "independent frontmatter object" — the shared-cache leak it guards against).
  const FRAGMENT_BODY = "# Adopt gating fragment\n\nUnique body for adopt-gating coverage.\n";
  const ASPECT_BODY = "Unique aspect body for adopt-gating coverage.\n";

  it("does not mint or write back UUIDs without { adopt: true }", async () => {
    writeFileSync(join(tmpDir, "fragments/no-uuid.md"), FRAGMENT_BODY);
    writeFileSync(join(tmpDir, "aspects/no-uuid.md"), ASPECT_BODY);
    const vault = createVault(config);

    const fragments = await vault.fragments.readAllWithFilePaths();
    const aspects = await vault.aspects.readAllWithFilePaths();

    // No file was rewritten — the metadata-less files are untouched on disk.
    expect(readFileSync(join(tmpDir, "fragments/no-uuid.md"), "utf8")).toBe(FRAGMENT_BODY);
    expect(readFileSync(join(tmpDir, "aspects/no-uuid.md"), "utf8")).toBe(ASPECT_BODY);
    // The entity reads with an undefined UUID rather than a freshly minted one.
    expect(
      fragments.entities.find(({ filePath }) => filePath === "no-uuid.md")?.entity.uuid,
    ).toBeUndefined();
    expect(
      aspects.entities.find(({ filePath }) => filePath === "no-uuid.md")?.entity.uuid,
    ).toBeUndefined();
  });

  it("mints and writes back UUIDs once with { adopt: true }", async () => {
    writeFileSync(join(tmpDir, "fragments/no-uuid.md"), FRAGMENT_BODY);
    writeFileSync(join(tmpDir, "aspects/no-uuid.md"), ASPECT_BODY);
    const vault = createVault(config);

    const fragments = await vault.fragments.readAllWithFilePaths({ adopt: true });
    const aspects = await vault.aspects.readAllWithFilePaths({ adopt: true });

    const fragmentEntry = fragments.entities.find(({ filePath }) => filePath === "no-uuid.md");
    const aspectEntry = aspects.entities.find(({ filePath }) => filePath === "no-uuid.md");
    if (!fragmentEntry || !aspectEntry) {
      throw new Error("adopted entries not found");
    }
    expect(fragmentEntry.entity.uuid).toBeTruthy();
    expect(aspectEntry.entity.uuid).toBeTruthy();

    // The returned rawContent is exactly what landed on disk (single canonical write per file).
    expect(readFileSync(join(tmpDir, "fragments/no-uuid.md"), "utf8")).toBe(
      fragmentEntry.rawContent,
    );
    expect(readFileSync(join(tmpDir, "aspects/no-uuid.md"), "utf8")).toBe(aspectEntry.rawContent);
  });
});
