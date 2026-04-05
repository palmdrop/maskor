import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRegistryDatabase } from "../db";
import { createProjectRegistry } from "../registry/registry";
import { LOCAL_USER_UUID } from "../registry/types";
import type { ProjectUUID } from "@maskor/shared";

const FIXTURES = join(import.meta.dir, "../../fixtures/vault");

let tmpDir: string;
let vaultDir: string;
let configDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-registry-test-"));
  vaultDir = join(tmpDir, "vault");
  configDir = join(tmpDir, "config");
  cpSync(FIXTURES, vaultDir, { recursive: true });
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

  it("writes .maskor/project.json manifest into the vault", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir);

    const manifestFile = Bun.file(join(vaultDir, ".maskor", "project.json"));
    expect(await manifestFile.exists()).toBe(true);

    const manifest = await manifestFile.json();
    expect(manifest.projectUUID).toBe(record.projectUUID);
    expect(manifest.name).toBe("My Project");
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

  it("returns all registered projects", async () => {
    const registry = makeRegistry();
    await registry.registerProject("Project A", vaultDir);

    const secondVaultDir = join(tmpDir, "vault2");
    cpSync(FIXTURES, secondVaultDir, { recursive: true });
    await registry.registerProject("Project B", secondVaultDir);

    const projects = await registry.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((project) => project.name)).toContain("Project A");
    expect(projects.map((project) => project.name)).toContain("Project B");
  });
});

describe("registry.findByUUID", () => {
  it("returns the project record for a known UUID", async () => {
    const registry = makeRegistry();
    const registered = await registry.registerProject("My Project", vaultDir);
    const found = await registry.findByUUID(registered.projectUUID);

    expect(found).not.toBeNull();
    expect(found?.projectUUID).toBe(registered.projectUUID);
    expect(found?.name).toBe("My Project");
  });

  it("returns null for an unknown UUID", async () => {
    const registry = makeRegistry();
    const result = await registry.findByUUID("00000000-0000-0000-0000-000000000000" as ProjectUUID);
    expect(result).toBeNull();
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
