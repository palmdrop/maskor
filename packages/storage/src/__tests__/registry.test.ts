import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRegistryDatabase } from "../db/registry";
import { createProjectRegistry } from "../registry/registry";
import { LOCAL_USER_UUID } from "../registry/types";
import { ProjectConflictError } from "../registry/errors";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let tmpDir: string;
let vaultDir: string;
let configDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-registry-test-"));
  vaultDir = join(tmpDir, "vault");
  configDir = join(tmpDir, "config");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeRegistry = () => {
  const database = createRegistryDatabase(configDir);
  return createProjectRegistry(database);
};

describe("registry.registerProject", () => {
  it("registers a project and returns a ProjectRecord", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    expect(record.name).toBe("My Project");
    expect(record.vaultPath).toBe(vaultDir);
    expect(record.projectUUID).toBeTruthy();
    expect(record.userUUID).toBe(LOCAL_USER_UUID);
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.updatedAt).toBeInstanceOf(Date);
  });

  it("writes .maskor/project.json with UUID, name, and default editor config", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    const manifestFile = Bun.file(join(vaultDir, ".maskor", "project.json"));
    expect(await manifestFile.exists()).toBe(true);

    const manifest = await manifestFile.json();
    expect(manifest.projectUUID).toBe(record.projectUUID);
    expect(manifest.name).toBe("My Project");
    expect(manifest.registeredAt).toBeTruthy();
    expect(manifest.config.editor.vimMode).toBe(false);
    expect(manifest.config.editor.rawMarkdownMode).toBe(false);
    expect(manifest.config.editor.fontSize).toBe(16);
    expect(manifest.config.editor.maxParagraphWidth).toBe(72);
  });

  it("returns editor defaults from the manifest", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    expect(record.editor.vimMode).toBe(false);
    expect(record.editor.rawMarkdownMode).toBe(false);
    expect(record.editor.fontSize).toBe(16);
    expect(record.editor.maxParagraphWidth).toBe(72);
  });

  it("throws when vault path does not exist", async () => {
    const registry = makeRegistry();
    await expect(registry.registerProject("Bad Project", "/nonexistent/path", "adopt")).rejects.toThrow();
  });

  it("throws when vault path is a file, not a directory", async () => {
    const registry = makeRegistry();
    const filePath = join(vaultDir, "fragments", "the-bridge.md");
    await expect(registry.registerProject("Bad Project", filePath, "adopt")).rejects.toThrow();
  });

  it("reuses manifest UUID when adopting vault with existing project.json", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    // BASIC_VAULT has .maskor/project.json with a known UUID
    expect(record.projectUUID).toBe("19a2045a-5902-435b-9a8b-adff93e6eef2");
  });

  it("assigns new UUID when adopting vault without existing project.json", async () => {
    const registry = makeRegistry();
    const emptyVaultDir = join(tmpDir, "empty-vault");
    mkdirSync(emptyVaultDir, { recursive: true });
    const record = await registry.registerProject("No Manifest Project", emptyVaultDir, "adopt");
    expect(record.projectUUID).toBeTruthy();
    // A UUID was generated — it won't match the BASIC_VAULT manifest UUID
    expect(record.projectUUID).not.toBe("19a2045a-5902-435b-9a8b-adff93e6eef2");
  });

  it("creates directory when registering with mode create on missing path", async () => {
    const registry = makeRegistry();
    const newPath = join(tmpDir, "brand-new-project");
    expect(existsSync(newPath)).toBe(false);
    const record = await registry.registerProject("New Project", newPath, "create");
    expect(existsSync(newPath)).toBe(true);
    expect(record.vaultPath).toBe(newPath);
    expect(record.projectUUID).toBeTruthy();
  });

  it("throws ProjectConflictError when vaultPath already registered", async () => {
    const registry = makeRegistry();
    await registry.registerProject("First", vaultDir, "adopt");
    await expect(
      registry.registerProject("Second", vaultDir, "adopt"),
    ).rejects.toBeInstanceOf(ProjectConflictError);
  });
});

describe("registry.listProjects", () => {
  it("returns empty array when no projects registered", async () => {
    const registry = makeRegistry();
    const projects = await registry.listProjects();
    expect(projects).toEqual([]);
  });

  it("returns all registered projects with names from vault manifests", async () => {
    const registry = makeRegistry();
    await registry.registerProject("Project A", vaultDir, "adopt");

    // Use a fresh empty directory for the second vault — both vaultDir copies share the same
    // manifest UUID, so registering a second BASIC_VAULT copy would cause a UUID conflict.
    const secondVaultDir = join(tmpDir, "vault2");
    mkdirSync(secondVaultDir, { recursive: true });
    await registry.registerProject("Project B", secondVaultDir, "adopt");

    const projects = await registry.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((project) => project.name)).toContain("Project A");
    expect(projects.map((project) => project.name)).toContain("Project B");
  });
});

describe("registry.findByUUID", () => {
  it("returns the project record for a known UUID with data from vault manifest", async () => {
    const registry = makeRegistry();
    const registered = await registry.registerProject("My Project", vaultDir, "adopt");
    const found = await registry.findByUUID(registered.projectUUID);

    expect(found).not.toBeNull();
    expect(found?.projectUUID).toBe(registered.projectUUID);
    expect(found?.name).toBe("My Project");
    expect(found?.editor.vimMode).toBe(false);
    expect(found?.editor.rawMarkdownMode).toBe(false);
    expect(found?.editor.fontSize).toBe(16);
    expect(found?.editor.maxParagraphWidth).toBe(72);
  });

  it("returns null for an unknown UUID", async () => {
    const registry = makeRegistry();
    const result = await registry.findByUUID("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("registry.updateProject", () => {
  it("updates name in the manifest and preserves editor config", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    const updated = await registry.updateProject(record.projectUUID, { name: "Renamed" });

    expect(updated.name).toBe("Renamed");
    expect(updated.editor.vimMode).toBe(false);
    expect(updated.editor.rawMarkdownMode).toBe(false);
    expect(updated.editor.fontSize).toBe(16);
    expect(updated.editor.maxParagraphWidth).toBe(72);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.name).toBe("Renamed");
    expect(manifest.config.editor.vimMode).toBe(false);
  });

  it("updates editor config in the manifest and preserves name", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    const updated = await registry.updateProject(record.projectUUID, {
      editor: { vimMode: true },
    });

    expect(updated.name).toBe("My Project");
    expect(updated.editor.vimMode).toBe(true);
    expect(updated.editor.rawMarkdownMode).toBe(false);
    expect(updated.editor.fontSize).toBe(16);
    expect(updated.editor.maxParagraphWidth).toBe(72);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.name).toBe("My Project");
    expect(manifest.config.editor.vimMode).toBe(true);
  });

  it("updates fontSize and maxParagraphWidth in the manifest", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    const updated = await registry.updateProject(record.projectUUID, {
      editor: { fontSize: 20, maxParagraphWidth: 80 },
    });

    expect(updated.editor.fontSize).toBe(20);
    expect(updated.editor.maxParagraphWidth).toBe(80);
    expect(updated.editor.vimMode).toBe(false);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.config.editor.fontSize).toBe(20);
    expect(manifest.config.editor.maxParagraphWidth).toBe(80);
  });

  it("updates fontSize independently without affecting other editor fields", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    await registry.updateProject(record.projectUUID, { editor: { vimMode: true } });
    const updated = await registry.updateProject(record.projectUUID, {
      editor: { fontSize: 18 },
    });

    expect(updated.editor.vimMode).toBe(true);
    expect(updated.editor.fontSize).toBe(18);
    expect(updated.editor.maxParagraphWidth).toBe(72);
  });

  it("throws ProjectNotFoundError for unknown UUID", async () => {
    const registry = makeRegistry();
    const { ProjectNotFoundError } = await import("../registry/errors");
    await expect(
      registry.updateProject("00000000-0000-0000-0000-000000000000", { name: "x" }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe("registry.removeProject", () => {
  it("removes the project from the registry", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    await registry.removeProject(record.projectUUID);

    const projects = await registry.listProjects();
    expect(projects.length).toBe(0);
  });

  it("findByUUID returns null after removal", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    await registry.removeProject(record.projectUUID);

    const found = await registry.findByUUID(record.projectUUID);
    expect(found).toBeNull();
  });
});

describe("registry re-registration (vault portability)", () => {
  it("preserves existing manifest data when vault is re-registered", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("Original Name", vaultDir, "adopt");

    await registry.updateProject(record.projectUUID, { editor: { vimMode: true } });
    await registry.removeProject(record.projectUUID);

    const registry2 = makeRegistry();
    const reregistered = await registry2.registerProject("Original Name", vaultDir, "adopt");

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.name).toBe("Original Name");
    expect(manifest.config.editor.vimMode).toBe(true);
    expect(reregistered.name).toBe("Original Name");
    expect(reregistered.editor.vimMode).toBe(true);
  });
});
