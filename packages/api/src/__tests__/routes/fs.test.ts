import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestApp } from "../helpers/create-test-app";

let testContext: ReturnType<typeof createTestApp>;
let temporaryDirectory: string;
let restrictedDirectory: string;

beforeAll(() => {
  testContext = createTestApp();
  temporaryDirectory = mkdtempSync(join(tmpdir(), "maskor-fs-test-"));

  // Create a directory structure for testing
  mkdirSync(join(temporaryDirectory, "normal-folder"));
  mkdirSync(join(temporaryDirectory, ".hidden-folder"));
  writeFileSync(join(temporaryDirectory, "normal-file.txt"), "content");
  writeFileSync(join(temporaryDirectory, ".hidden-file.txt"), "content");

  // Maskor project folder
  const maskorFolder = join(temporaryDirectory, "maskor-project");
  mkdirSync(join(maskorFolder, ".maskor"), { recursive: true });
  writeFileSync(join(maskorFolder, ".maskor", "project.json"), "{}");

  // Obsidian vault folder
  const obsidianFolder = join(temporaryDirectory, "obsidian-vault");
  mkdirSync(join(obsidianFolder, ".obsidian"), { recursive: true });

  // Permission-denied directory (empty, then restricted)
  restrictedDirectory = join(temporaryDirectory, "restricted");
  mkdirSync(restrictedDirectory);
  chmodSync(restrictedDirectory, 0o000);
});

afterAll(() => {
  // Restore permissions before cleanup
  try {
    chmodSync(restrictedDirectory, 0o755);
  } catch {}
  rmSync(temporaryDirectory, { recursive: true, force: true });
  testContext.cleanup();
});

describe("GET /fs/list", () => {
  it("returns 400 for a relative path", async () => {
    const response = await testContext.app.request("/fs/list?path=relative/path/to/folder");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("BAD_REQUEST");
  });

  it("returns 404 when the path does not exist", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(join(temporaryDirectory, "does-not-exist"))}`,
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("NOT_FOUND");
  });

  it("returns 403 when the path exists but is not readable", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(restrictedDirectory)}`,
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("FORBIDDEN");
  });

  it("classifies entries as file or directory", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(temporaryDirectory)}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ name: string; kind: string }>;
    };

    const normalFolder = body.entries.find((entry) => entry.name === "normal-folder");
    const normalFile = body.entries.find((entry) => entry.name === "normal-file.txt");

    expect(normalFolder?.kind).toBe("directory");
    expect(normalFile?.kind).toBe("file");
  });

  it("sets hidden flag for entries starting with a dot", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(temporaryDirectory)}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ name: string; hidden: boolean }>;
    };

    const hiddenFolder = body.entries.find((entry) => entry.name === ".hidden-folder");
    const hiddenFile = body.entries.find((entry) => entry.name === ".hidden-file.txt");
    const normalFolder = body.entries.find((entry) => entry.name === "normal-folder");
    const normalFile = body.entries.find((entry) => entry.name === "normal-file.txt");

    expect(hiddenFolder?.hidden).toBe(true);
    expect(hiddenFile?.hidden).toBe(true);
    expect(normalFolder?.hidden).toBe(false);
    expect(normalFile?.hidden).toBe(false);
  });

  it("sets hasMaskorManifest when directory contains .maskor/project.json", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(temporaryDirectory)}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ name: string; hasMaskorManifest: boolean }>;
    };

    const maskorProject = body.entries.find((entry) => entry.name === "maskor-project");
    const normalFolder = body.entries.find((entry) => entry.name === "normal-folder");
    const normalFile = body.entries.find((entry) => entry.name === "normal-file.txt");

    expect(maskorProject?.hasMaskorManifest).toBe(true);
    expect(normalFolder?.hasMaskorManifest).toBe(false);
    expect(normalFile?.hasMaskorManifest).toBe(false);
  });

  it("sets hasObsidianDir when directory contains .obsidian", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(temporaryDirectory)}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: Array<{ name: string; hasObsidianDir: boolean }>;
    };

    const obsidianVault = body.entries.find((entry) => entry.name === "obsidian-vault");
    const normalFolder = body.entries.find((entry) => entry.name === "normal-folder");

    expect(obsidianVault?.hasObsidianDir).toBe(true);
    expect(normalFolder?.hasObsidianDir).toBe(false);
  });

  it("returns the current path and parent path in the response", async () => {
    const response = await testContext.app.request(
      `/fs/list?path=${encodeURIComponent(temporaryDirectory)}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string; parent: string | null };

    expect(body.path).toBe(temporaryDirectory);
    expect(typeof body.parent).toBe("string");
  });

  it("returns null for parent when path is filesystem root", async () => {
    const response = await testContext.app.request("/fs/list?path=%2F");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string; parent: string | null };

    expect(body.path).toBe("/");
    expect(body.parent).toBeNull();
  });
});
