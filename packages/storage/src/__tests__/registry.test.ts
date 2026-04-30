import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRegistryDatabase } from "../db/registry";
import { createProjectRegistry } from "../registry/registry";
import { LOCAL_USER_UUID } from "../registry/types";
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
    const record = await registry.registerProject("My Project", vaultDir);

    expect(record.name).toBe("My Project");
    expect(record.vaultPath).toBe(vaultDir);
    expect(record.projectUUID).toBeTruthy();
    expect(record.userUUID).toBe(LOCAL_USER_UUID);
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.updatedAt).toBeInstanceOf(Date);
  });

  it("writes .maskor/project.json with UUID, name, and default editor config", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir);

    const manifestFile = Bun.file(join(vaultDir, ".maskor", "project.json"));
    expect(await manifestFile.exists()).toBe(true);

    const manifest = await manifestFile.json();
    expect(manifest.projectUUID).toBe(record.projectUUID);
    expect(manifest.name).toBe("My Project");
    expect(manifest.registeredAt).toBeTruthy();
    expect(manifest.config.editor.vimMode).toBe(false);
    expect(manifest.config.editor.rawMarkdownMode).toBe(false);
  });

  it("returns editor defaults from the manifest", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir);

    expect(record.editor.vimMode).toBe(false);
    expect(record.editor.rawMarkdownMode).toBe(false);
  });

  it("throws when vault path does not exist", async () => {
    const registry = makeRegistry();
    await expect(registry.registerProject("Bad Project", "/nonexistent/path")).rejects.toThrow();
  });

  it("throws when vault path is a file, not a directory", async () => {
    const registry = makeRegistry();
    const filePath = join(vaultDir, "fragments", "the-bridge.md");
    await expect(registry.registerProject("Bad Project", filePath)).rejects.toThrow();
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
    await registry.registerProject("Project A", vaultDir);

    const secondVaultDir = join(tmpDir, "vault2");
    cpSync(BASIC_VAULT, secondVaultDir, { recursive: true });
    await registry.registerProject("Project B", secondVaultDir);

    const projects = await registry.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((project) => project.name)).toContain("Project A");
    expect(projects.map((project) => project.name)).toContain("Project B");
  });
});

describe("registry.findByUUID", () => {
  it("returns the project record for a known UUID with data from vault manifest", async () => {
    const registry = makeRegistry();
    const registered = await registry.registerProject("My Project", vaultDir);
    const found = await registry.findByUUID(registered.projectUUID);

    expect(found).not.toBeNull();
    expect(found?.projectUUID).toBe(registered.projectUUID);
    expect(found?.name).toBe("My Project");
    expect(found?.editor.vimMode).toBe(false);
    expect(found?.editor.rawMarkdownMode).toBe(false);
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
    const record = await registry.registerProject("My Project", vaultDir);
    const updated = await registry.updateProject(record.projectUUID, { name: "Renamed" });

    expect(updated.name).toBe("Renamed");
    expect(updated.editor.vimMode).toBe(false);
    expect(updated.editor.rawMarkdownMode).toBe(false);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.name).toBe("Renamed");
    expect(manifest.config.editor.vimMode).toBe(false);
  });

  it("updates editor config in the manifest and preserves name", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir);
    const updated = await registry.updateProject(record.projectUUID, {
      editor: { vimMode: true },
    });

    expect(updated.name).toBe("My Project");
    expect(updated.editor.vimMode).toBe(true);
    expect(updated.editor.rawMarkdownMode).toBe(false);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.name).toBe("My Project");
    expect(manifest.config.editor.vimMode).toBe(true);
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
    const record = await registry.registerProject("My Project", vaultDir);

    await registry.removeProject(record.projectUUID);

    const projects = await registry.listProjects();
    expect(projects.length).toBe(0);
  });

  it("findByUUID returns null after removal", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir);
    await registry.removeProject(record.projectUUID);

    const found = await registry.findByUUID(record.projectUUID);
    expect(found).toBeNull();
  });
});

describe("registry re-registration (vault portability)", () => {
  it("preserves existing manifest data when vault is re-registered", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("Original Name", vaultDir);

    await registry.updateProject(record.projectUUID, { editor: { vimMode: true } });
    await registry.removeProject(record.projectUUID);

    const registry2 = makeRegistry();
    const reregistered = await registry2.registerProject("Original Name", vaultDir);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.name).toBe("Original Name");
    expect(manifest.config.editor.vimMode).toBe(true);
    expect(reregistered.name).toBe("Original Name");
    expect(reregistered.editor.vimMode).toBe(true);
  });
});
