import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createVault } from "../vault/markdown/vault";
import type { VaultConfig } from "../vault/types";
import type { Margin } from "@maskor/shared";
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let tmpDir: string;
let config: VaultConfig;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-margins-test-"));
  cpSync(BASIC_VAULT, tmpDir, { recursive: true });
  config = { root: tmpDir };
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeMargin = (overrides: Partial<Margin> = {}): Margin => ({
  fragmentUuid: "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b",
  fragmentKey: "the-bridge",
  notes: "Some whole-fragment thinking.",
  comments: [{ markerId: "aaa", excerpt: "The bridge groans.", body: "Rework this." }],
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-01T11:00:00.000Z"),
  ...overrides,
});

describe("vault.margins.write + read", () => {
  it("lazily creates margins/<key>.md on first write and reads it back", async () => {
    const vault = createVault(config);
    expect(existsSync(join(tmpDir, "margins"))).toBe(false);

    const margin = makeMargin();
    await vault.margins.write(margin);

    expect(existsSync(join(tmpDir, "margins", "the-bridge.md"))).toBe(true);
    const reread = await vault.margins.read("the-bridge.md");
    expect(reread.fragmentUuid).toBe(margin.fragmentUuid);
    expect(reread.notes).toBe(margin.notes);
    expect(reread.comments).toEqual(margin.comments);
  });

  it("round-trips notes, comment bodies, excerpts and anchors through vault -> read", async () => {
    const vault = createVault(config);
    const margin = makeMargin({
      comments: [
        { markerId: "aaa", excerpt: "The bridge groans.", body: "Too literal." },
        { markerId: "bbb", excerpt: "She paused at the rail.", body: "Strong beat." },
      ],
    });
    await vault.margins.write(margin);
    const reread = await vault.margins.read("the-bridge.md");
    expect(reread.comments).toEqual(margin.comments);
  });

  it("persists a margin emptied of notes and comments (no auto-removal)", async () => {
    const vault = createVault(config);
    await vault.margins.write(makeMargin());
    await vault.margins.write(makeMargin({ notes: "", comments: [] }));
    expect(existsSync(join(tmpDir, "margins", "the-bridge.md"))).toBe(true);
    const reread = await vault.margins.read("the-bridge.md");
    expect(reread.notes).toBe("");
    expect(reread.comments).toEqual([]);
  });
});

describe("vault.margins.readAll", () => {
  it("reads active and discarded margins", async () => {
    const vault = createVault(config);
    await vault.margins.write(makeMargin({ fragmentKey: "the-bridge" }));
    await vault.margins.write(makeMargin({ fragmentKey: "the-window" }));
    await vault.margins.discard("the-window");

    const all = await vault.margins.readAll();
    const keys = all.map((margin) => margin.fragmentKey).sort();
    expect(keys).toEqual(["the-bridge", "the-window"]);
  });
});

describe("vault.margins.rename", () => {
  it("renames an active margin file", async () => {
    const vault = createVault(config);
    await vault.margins.write(makeMargin({ fragmentKey: "the-bridge" }));
    await vault.margins.rename("the-bridge", "the-old-bridge");
    expect(existsSync(join(tmpDir, "margins", "the-bridge.md"))).toBe(false);
    expect(existsSync(join(tmpDir, "margins", "the-old-bridge.md"))).toBe(true);
  });

  it("no-ops when the fragment has no margin", async () => {
    const vault = createVault(config);
    await vault.margins.rename("never-had-one", "still-none");
    expect(existsSync(join(tmpDir, "margins", "still-none.md"))).toBe(false);
  });
});

describe("vault.margins.discard / restore", () => {
  it("moves a margin into and back out of discarded/", async () => {
    const vault = createVault(config);
    await vault.margins.write(makeMargin({ fragmentKey: "the-bridge" }));

    await vault.margins.discard("the-bridge");
    expect(existsSync(join(tmpDir, "margins", "the-bridge.md"))).toBe(false);
    expect(existsSync(join(tmpDir, "margins", "discarded", "the-bridge.md"))).toBe(true);

    await vault.margins.restore("the-bridge");
    expect(existsSync(join(tmpDir, "margins", "the-bridge.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "margins", "discarded", "the-bridge.md"))).toBe(false);
  });

  it("discard no-ops when the fragment has no margin", async () => {
    const vault = createVault(config);
    await vault.margins.discard("no-margin-here");
    expect(existsSync(join(tmpDir, "margins", "discarded", "no-margin-here.md"))).toBe(false);
  });
});

describe("vault.margins.delete", () => {
  it("deletes a discarded margin", async () => {
    const vault = createVault(config);
    await vault.margins.write(makeMargin({ fragmentKey: "the-bridge" }));
    await vault.margins.discard("the-bridge");
    await vault.margins.delete("the-bridge");
    expect(existsSync(join(tmpDir, "margins", "discarded", "the-bridge.md"))).toBe(false);
  });

  it("deletes an active margin as a fallback", async () => {
    const vault = createVault(config);
    await vault.margins.write(makeMargin({ fragmentKey: "the-bridge" }));
    await vault.margins.delete("the-bridge");
    expect(existsSync(join(tmpDir, "margins", "the-bridge.md"))).toBe(false);
  });

  it("no-ops when there is no margin", async () => {
    const vault = createVault(config);
    await vault.margins.delete("nothing");
    expect(existsSync(join(tmpDir, "margins", "nothing.md"))).toBe(false);
  });
});
