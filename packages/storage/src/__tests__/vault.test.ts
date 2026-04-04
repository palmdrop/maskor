import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createVault } from "../backend/markdown/vault";
import type { VaultConfig } from "../backend/types";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const FIXTURES = join(import.meta.dir, "../../fixtures/vault");

let tmpDir: string;
let config: VaultConfig;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-vault-test-"));
  cpSync(FIXTURES, tmpDir, { recursive: true });
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

  it("sets pool to discarded for files in discarded/ folder", async () => {
    const vault = createVault(config);
    const fragments = await vault.fragments.readAll();
    const discarded = fragments.filter((f) => f.pool === "discarded");
    expect(discarded.length).toBeGreaterThanOrEqual(2);
  });

  it("overrides pool for file in discarded/ with wrong frontmatter", async () => {
    const vault = createVault(config);
    const fragments = await vault.fragments.readAll();
    // the-window.md is in discarded/ but has pool: unplaced in frontmatter
    const theWindow = fragments.find((f) => f.title === "The Window");
    expect(theWindow?.pool ?? null).toBe("discarded");
  });
});

describe("vault.fragments.read", () => {
  it("reads a fragment by file path", async () => {
    const vault = createVault(config);
    const fragment = await vault.fragments.read(join(tmpDir, "fragments", "the-bridge.md"));
    expect(fragment.title).toBe("The Bridge");
    expect(fragment.properties["grief"]).toEqual({ weight: 0.6 });
    expect(fragment.notes).toContain("bridge observation");
  });

  it("assigns uuid from frontmatter", async () => {
    const vault = createVault(config);
    const fragment = await vault.fragments.read(join(tmpDir, "fragments", "the-bridge.md"));
    expect(fragment.uuid as string).toBe("frag-0001-0000-0000-000000000001");
  });
});

describe("vault.fragments.write", () => {
  it("writes a fragment file and reads it back", async () => {
    const vault = createVault(config);
    const original = await vault.fragments.read(join(tmpDir, "fragments", "the-bridge.md"));
    const modified = { ...original, readyStatus: 0.95 };

    await vault.fragments.write(modified);
    const reread = await vault.fragments.read(join(tmpDir, "fragments", "the-bridge.md"));
    expect(reread.readyStatus).toBe(0.95);
  });
});

describe("vault.fragments.discard", () => {
  it("moves fragment to discarded/ and updates pool", async () => {
    const vault = createVault(config);
    const fragment = await vault.fragments.read(join(tmpDir, "fragments", "the-bridge.md"));
    await vault.fragments.discard(fragment.uuid);

    const discarded = await vault.fragments.read(
      join(tmpDir, "fragments", "discarded", "the-bridge.md"),
    );
    expect(discarded.pool).toBe("discarded");
  });

  it("throws when uuid not found", async () => {
    const vault = createVault(config);
    expect(vault.fragments.discard("nonexistent-uuid" as any)).rejects.toThrow();
  });
});

// --- aspects ---

describe("vault.aspects.readAll", () => {
  it("reads all aspects", async () => {
    const vault = createVault(config);
    const aspects = await vault.aspects.readAll();
    expect(aspects.length).toBe(4);
    const keys = aspects.map((a) => a.key);
    expect(keys).toContain("grief");
    expect(keys).toContain("city");
  });

  it("reads description from body", async () => {
    const vault = createVault(config);
    const aspects = await vault.aspects.readAll();
    const grief = aspects.find((a) => a.key === "grief");
    expect(grief?.description ?? null).toBeTruthy();
  });
});

describe("vault.aspects.write", () => {
  it("writes and reads back an aspect", async () => {
    const vault = createVault(config);
    const aspects = await vault.aspects.readAll();
    const grief = aspects.find((a) => a.key === "grief")!;
    const modified = { ...grief, category: "emotion" };

    await vault.aspects.write(modified);
    const reread = await vault.aspects.read(join(tmpDir, "aspects", "grief.md"));
    expect(reread.category).toBe("emotion");
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
    const bridgeNote = notes.find((n) => n.title === "bridge observation");
    expect(bridgeNote?.content).toBeTruthy();
  });
});

// --- references ---

describe("vault.references.readAll", () => {
  it("reads all references", async () => {
    const vault = createVault(config);
    const refs = await vault.references.readAll();
    expect(refs.length).toBe(1);
    expect(refs[0]?.name).toBe("city research");
  });
});

// --- pieces ---

describe("vault.pieces.consumeAll", () => {
  it("converts pieces to fragments and removes source files", async () => {
    const vault = createVault(config);
    const fragments = await vault.pieces.consumeAll();

    expect(fragments.length).toBe(1);
    expect(fragments[0]?.pool).toBe("unprocessed");

    // source file should be gone
    const pieceFile = Bun.file(join(tmpDir, "pieces", "raw-memory.md"));
    expect(await pieceFile.exists()).toBe(false);

    // fragment file should exist
    const fragFile = Bun.file(join(tmpDir, "fragments", "raw-memory.md"));
    expect(await fragFile.exists()).toBe(true);
  });
});
