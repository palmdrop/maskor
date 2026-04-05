import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initFragment } from "../vault/markdown/init";
import { parseFile } from "../vault/markdown/parse";
import type { VaultConfig } from "../vault/types";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;
let config: VaultConfig;

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
    const piece = { title: "The Bridge", content: "She crossed it every morning." };
    const fragment = await initFragment(config, piece);

    const file = Bun.file(join(tmpDir, "fragments", "the-bridge.md"));
    const raw = await file.text();
    const parsed = parseFile(raw);

    expect(parsed.frontmatter.title).toBe("The Bridge");
    expect(parsed.frontmatter.pool).toBe("unprocessed");
    expect(parsed.frontmatter.readyStatus).toBe(0);
    expect(parsed.frontmatter.version).toBe(1);
    expect(parsed.frontmatter.uuid).toBe(fragment.uuid);
  });

  it("writes content as body", async () => {
    const piece = { title: "The Bridge", content: "She crossed it every morning." };
    await initFragment(config, piece);

    const file = Bun.file(join(tmpDir, "fragments", "the-bridge.md"));
    const raw = await file.text();
    const parsed = parseFile(raw);

    expect(parsed.body).toContain("She crossed it every morning.");
  });

  it("returns the created Fragment", async () => {
    const piece = { title: "Late Winter", content: "The cold had a particular quality." };
    const fragment = await initFragment(config, piece);

    expect(fragment.title).toBe("Late Winter");
    expect(fragment.pool).toBe("unprocessed");
    expect(fragment.version).toBe(1);
    expect(fragment.readyStatus).toBe(0);
    expect(typeof fragment.uuid).toBe("string");
  });

  it("derives title from first line of content when title is missing", async () => {
    const piece = { content: "A line that becomes the title.\n\nMore content." };
    const fragment = await initFragment(config, piece);
    expect(fragment.title).toBe("A line that becomes the title.");
  });

  it("falls back to fragment-<uuid> when content has no text", async () => {
    const piece = { content: "" };
    const fragment = await initFragment(config, piece);
    expect(fragment.title).toBe(`fragment-${fragment.uuid}`);
  });

  it("throws VaultError when file already exists", async () => {
    const piece = { title: "The Bridge", content: "First." };
    await initFragment(config, piece);

    expect(initFragment(config, { title: "The Bridge", content: "Second." })).rejects.toThrow();
  });

  it("slugifies the title for the filename", async () => {
    const piece = { title: "Late Winter, 1987!", content: "Content." };
    await initFragment(config, piece);

    const file = Bun.file(join(tmpDir, "fragments", "late-winter-1987.md"));
    expect(await file.exists()).toBe(true);
  });
});
