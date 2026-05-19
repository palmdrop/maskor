import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSwapStorage, SwapEntityTypeError } from "../swap";

let vaultPath: string;

beforeEach(() => {
  vaultPath = mkdtempSync(join(tmpdir(), "maskor-swap-test-"));
});

afterEach(() => {
  rmSync(vaultPath, { recursive: true, force: true });
});

describe("createSwapStorage", () => {
  it("writes a swap file under .maskor/swap/<entityType>/<uuid>.json", async () => {
    const storage = createSwapStorage({ vaultPath });
    const result = await storage.write("fragment", "uuid-1", "hello world");

    expect(result.content).toBe("hello world");
    expect(typeof result.savedAt).toBe("string");

    const onDisk = readFileSync(
      join(vaultPath, ".maskor", "swap", "fragment", "uuid-1.json"),
      "utf8",
    );
    const parsed = JSON.parse(onDisk);
    expect(parsed.content).toBe("hello world");
    expect(parsed.savedAt).toBe(result.savedAt);
  });

  it("round-trips write/read", async () => {
    const storage = createSwapStorage({ vaultPath });
    await storage.write("aspect", "uuid-2", "aspect prose");
    const result = await storage.read("aspect", "uuid-2");
    expect(result?.content).toBe("aspect prose");
  });

  it("read returns null for a missing swap file", async () => {
    const storage = createSwapStorage({ vaultPath });
    const result = await storage.read("note", "missing-uuid");
    expect(result).toBeNull();
  });

  it("delete removes the swap file", async () => {
    const storage = createSwapStorage({ vaultPath });
    await storage.write("reference", "uuid-3", "ref content");
    const filePath = join(vaultPath, ".maskor", "swap", "reference", "uuid-3.json");
    expect(existsSync(filePath)).toBe(true);

    await storage.delete("reference", "uuid-3");
    expect(existsSync(filePath)).toBe(false);
  });

  it("delete is idempotent for a missing swap file", async () => {
    const storage = createSwapStorage({ vaultPath });
    await expect(storage.delete("fragment", "never-existed")).resolves.toBeUndefined();
  });

  it("rejects unknown entity types on write", async () => {
    const storage = createSwapStorage({ vaultPath });
    await expect(
      // @ts-expect-error: deliberately invalid entity type for the boundary check
      storage.write("invalid-kind", "uuid-x", "content"),
    ).rejects.toBeInstanceOf(SwapEntityTypeError);
  });

  it("rejects unknown entity types on read", async () => {
    const storage = createSwapStorage({ vaultPath });
    await expect(
      // @ts-expect-error: deliberately invalid entity type for the boundary check
      storage.read("invalid-kind", "uuid-x"),
    ).rejects.toBeInstanceOf(SwapEntityTypeError);
  });

  it("rejects unknown entity types on delete", async () => {
    const storage = createSwapStorage({ vaultPath });
    await expect(
      // @ts-expect-error: deliberately invalid entity type for the boundary check
      storage.delete("invalid-kind", "uuid-x"),
    ).rejects.toBeInstanceOf(SwapEntityTypeError);
  });

  it("treats malformed JSON on disk as no-swap and quarantines the file", async () => {
    const storage = createSwapStorage({ vaultPath });
    const dir = join(vaultPath, ".maskor", "swap", "fragment");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "broken-uuid.json");
    writeFileSync(filePath, "{ not json");

    const result = await storage.read("fragment", "broken-uuid");
    expect(result).toBeNull();
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}.corrupt`)).toBe(true);
  });

  it("rejects swap files that parse but are missing required fields by quarantining them", async () => {
    const storage = createSwapStorage({ vaultPath });
    const dir = join(vaultPath, ".maskor", "swap", "note");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "partial-uuid.json");
    writeFileSync(filePath, JSON.stringify({ content: "missing savedAt" }));

    const result = await storage.read("note", "partial-uuid");
    expect(result).toBeNull();
    expect(existsSync(`${filePath}.corrupt`)).toBe(true);
  });

  it("subsequent write after quarantine succeeds", async () => {
    const storage = createSwapStorage({ vaultPath });
    const dir = join(vaultPath, ".maskor", "swap", "fragment");
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "rewrite-uuid.json");
    writeFileSync(filePath, "garbage");

    await storage.read("fragment", "rewrite-uuid");
    await storage.write("fragment", "rewrite-uuid", "fresh content");

    const result = await storage.read("fragment", "rewrite-uuid");
    expect(result?.content).toBe("fresh content");
  });

  it("list returns empty when no swap files exist", async () => {
    const storage = createSwapStorage({ vaultPath });
    const entries = await storage.list();
    expect(entries).toEqual([]);
  });

  it("list returns entries across all entity types", async () => {
    const storage = createSwapStorage({ vaultPath });
    await storage.write("fragment", "frag-1", "content-1");
    await storage.write("aspect", "asp-1", "content-2");
    await storage.write("note", "note-1", "content-3");

    const entries = await storage.list();
    const sorted = entries.slice().sort((a, b) => a.entityUUID.localeCompare(b.entityUUID));
    expect(sorted).toHaveLength(3);
    expect(sorted.map((entry) => entry.entityType).sort()).toEqual(["aspect", "fragment", "note"]);
  });
});
