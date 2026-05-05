import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initFragment } from "../vault/markdown/init";
import { parseFile } from "../vault/markdown/parse";
import type { VaultConfig } from "../vault/types";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;
let config: VaultConfig;

const isValidDateString = (dateString: string) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-test-"));
  mkdirSync(join(tmpDir, "fragments"), { recursive: true });
  config = { root: tmpDir };
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("initFragment", () => {
  it("creates a fragment file with correct frontmatter", async () => {
    const piece = { key: "the-bridge", content: "She crossed it every morning." };
    const fragment = await initFragment(config, piece);

    const file = Bun.file(join(tmpDir, "fragments", "the-bridge.md"));
    const raw = await file.text();
    const parsed = parseFile(raw);

    expect(parsed.frontmatter.readyStatus).toBe(0);
    expect(typeof parsed.frontmatter.updatedAt).toBe("string");
    expect(isValidDateString(parsed.frontmatter.updatedAt as string)).toBe(true);
    expect(parsed.frontmatter.uuid).toBe(fragment.uuid);
  });

  it("writes content as body", async () => {
    const piece = { key: "the-bridge", content: "She crossed it every morning." };
    await initFragment(config, piece);

    const file = Bun.file(join(tmpDir, "fragments", "the-bridge.md"));
    const raw = await file.text();
    const parsed = parseFile(raw);

    expect(parsed.body).toContain("She crossed it every morning.");
  });

  it("returns the created Fragment with key, uuid, and defaults", async () => {
    const piece = { key: "late-winter", content: "The cold had a particular quality." };
    const fragment = await initFragment(config, piece);

    expect(fragment.key).toBe("late-winter");
    expect(fragment.isDiscarded).toBe(false);
    expect(fragment.readyStatus).toBe(0);
    expect(typeof fragment.uuid).toBe("string");
  });

  it("uses key as the filename without modification", async () => {
    const piece = { key: "late-winter-1987", content: "Content." };
    await initFragment(config, piece);

    const file = Bun.file(join(tmpDir, "fragments", "late-winter-1987.md"));
    expect(await file.exists()).toBe(true);
  });

  it("throws VaultError when file already exists", async () => {
    const piece = { key: "the-bridge", content: "First." };
    await initFragment(config, piece);

    expect(initFragment(config, { key: "the-bridge", content: "Second." })).rejects.toThrow();
  });
});
