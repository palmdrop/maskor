import { describe, it, expect, afterEach } from "bun:test";
import type { Logger } from "@maskor/shared";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFile } from "../vault/markdown/parse";
import { ensureUuid, writeBackFragmentFrontmatter } from "../vault/markdown/adopt";

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => noopLogger,
} as unknown as Logger;

let tmpDir: string;

const makeFile = (name: string, content: string): string => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-adopt-test-"));
  const filePath = join(tmpDir, name);
  writeFileSync(filePath, content);
  return filePath;
};

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe("adopt.writeBackFragmentFrontmatter", () => {
  it("writes full canonical frontmatter for a body-only fragment", async () => {
    const filePath = makeFile("intro.md", "# Intro\n\nHello world.\n");
    const parsed = parseFile(readFileSync(filePath, "utf8"));
    parsed.frontmatter.uuid = "11111111-1111-1111-1111-111111111111";

    const { fragment, rawContent } = await writeBackFragmentFrontmatter(parsed, filePath, "intro.md");

    expect(fragment.uuid).toBe("11111111-1111-1111-1111-111111111111");
    expect(fragment.key).toBe("intro");
    expect(fragment.readiness).toBe(0);
    expect(fragment.notes).toEqual([]);
    expect(fragment.references).toEqual([]);

    // Returned raw content matches exactly what landed on disk.
    expect(readFileSync(filePath, "utf8")).toBe(rawContent);

    // The on-disk file now carries the full canonical frontmatter.
    const reparsed = parseFile(rawContent);
    expect(reparsed.frontmatter.uuid).toBe("11111111-1111-1111-1111-111111111111");
    expect(reparsed.frontmatter.readiness).toBe(0);
    expect(reparsed.frontmatter).toHaveProperty("updatedAt");
    expect(reparsed.frontmatter).toHaveProperty("notes");
    expect(reparsed.frontmatter).toHaveProperty("references");
  });

  it("preserves a user-supplied field while filling the rest", async () => {
    const filePath = makeFile("scene.md", "---\nreadiness: 0.5\n---\n\nA scene.\n");
    const parsed = parseFile(readFileSync(filePath, "utf8"));
    parsed.frontmatter.uuid = "22222222-2222-2222-2222-222222222222";

    const { fragment } = await writeBackFragmentFrontmatter(parsed, filePath, "scene.md");

    expect(fragment.readiness).toBe(0.5);
    const reparsed = parseFile(readFileSync(filePath, "utf8"));
    expect(reparsed.frontmatter.readiness).toBe(0.5);
    expect(reparsed.frontmatter.uuid).toBe("22222222-2222-2222-2222-222222222222");
  });
});

describe("adopt.ensureUuid", () => {
  it("mints and writes back a UUID when none is present", async () => {
    const filePath = makeFile("aspect.md", "An aspect.\n");
    const raw = readFileSync(filePath, "utf8");
    const parsed = parseFile(raw);

    const result = await ensureUuid(parsed, filePath, raw, noopLogger, "aspect");

    expect(result.wasAssigned).toBe(true);
    expect(result.uuid).toBeTruthy();
    const reparsed = parseFile(readFileSync(filePath, "utf8"));
    expect(reparsed.frontmatter.uuid).toBe(result.uuid);
  });

  it("returns the existing UUID without rewriting the file", async () => {
    const raw = "---\nuuid: existing-uuid-abc\n---\nBody.\n";
    const filePath = makeFile("aspect.md", raw);
    const before = readFileSync(filePath, "utf8");
    const parsed = parseFile(raw);

    const result = await ensureUuid(parsed, filePath, raw, noopLogger, "aspect");

    expect(result.wasAssigned).toBe(false);
    expect(result.uuid).toBe("existing-uuid-abc");
    expect(readFileSync(filePath, "utf8")).toBe(before);
  });

  it("adds only the UUID for keyed entities, preserving other frontmatter", async () => {
    const raw = '---\ncolor: "#ffffff"\n---\nAn aspect description.\n';
    const filePath = makeFile("melancholy.md", raw);
    const parsed = parseFile(raw);

    const result = await ensureUuid(parsed, filePath, raw, noopLogger, "aspect");

    const reparsed = parseFile(readFileSync(filePath, "utf8"));
    expect(reparsed.frontmatter.uuid).toBe(result.uuid);
    expect(reparsed.frontmatter.color).toBe("#ffffff");
    expect(reparsed.body).toContain("An aspect description");
    // No fragment-only defaults leaked in.
    expect(reparsed.frontmatter).not.toHaveProperty("readiness");
  });
});
