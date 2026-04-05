import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStorageService } from "../service/storage-service";
import { ProjectNotFoundError } from "../registry/errors";
import { LOCAL_USER_UUID } from "../registry/types";
import type { ProjectUUID } from "@maskor/shared";

const FIXTURES = join(import.meta.dir, "../../fixtures/vault");

let tmpDir: string;
let vaultDir: string;
let configDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-service-test-"));
  vaultDir = join(tmpDir, "vault");
  configDir = join(tmpDir, "config");
  cpSync(FIXTURES, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeService = () => createStorageService({ configDirectory: configDir });

describe("StorageService.registerProject + resolveProject + getVault", () => {
  it("registers a project and resolves a vault that can read fragments", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);

    const context = await service.resolveProject(record.projectUUID);
    expect(context.projectUUID).toBe(record.projectUUID);
    expect(context.vaultPath).toBe(vaultDir);
    expect(context.userUUID).toBe(LOCAL_USER_UUID);

    const vault = service.getVault(context);
    const fragments = await vault.fragments.readAll();
    expect(fragments.length).toBeGreaterThanOrEqual(5);
  });

  it("getVault returns the same cached instance on repeated calls", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    const vaultOne = service.getVault(context);
    const vaultTwo = service.getVault(context);
    expect(vaultOne).toBe(vaultTwo);
  });
});

describe("StorageService.resolveProject", () => {
  it("throws ProjectNotFoundError for an unknown UUID", async () => {
    const service = makeService();
    const unknownUUID = "00000000-0000-0000-0000-000000000000" as ProjectUUID;

    expect(service.resolveProject(unknownUUID)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe("StorageService.removeProject", () => {
  it("removes the project and evicts the vault cache", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    // populate cache
    service.getVault(context);

    await service.removeProject(record.projectUUID);

    const projects = await service.listProjects();
    expect(projects.length).toBe(0);

    expect(service.resolveProject(record.projectUUID)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe("StorageService.listProjects", () => {
  it("returns all registered projects", async () => {
    const service = makeService();

    const secondVaultDir = join(tmpDir, "vault2");
    cpSync(FIXTURES, secondVaultDir, { recursive: true });

    await service.registerProject("Alpha", vaultDir);
    await service.registerProject("Beta", secondVaultDir);

    const projects = await service.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((project) => project.name)).toContain("Alpha");
    expect(projects.map((project) => project.name)).toContain("Beta");
  });
});
