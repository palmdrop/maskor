import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStorageService } from "../service/storage-service";
import { ProjectNotFoundError } from "../registry/errors";
import { LOCAL_USER_UUID } from "../registry/types";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let tmpDir: string;
let vaultDir: string;
let configDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-service-test-"));
  vaultDir = join(tmpDir, "vault");
  configDir = join(tmpDir, "config");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeService = () => createStorageService({ configDirectory: configDir });

describe("StorageService.registerProject + resolveProject", () => {
  it("registers a project and resolves a context with correct fields", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);

    const context = await service.resolveProject(record.projectUUID);
    expect(context.projectUUID).toBe(record.projectUUID);
    expect(context.vaultPath).toBe(vaultDir);
    expect(context.userUUID).toBe(LOCAL_USER_UUID);
  });

  it("can read fragments after rebuild", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);
    const fragments = await service.fragments.readAll(context);
    expect(fragments.length).toBeGreaterThanOrEqual(5);
  });
});

describe("StorageService.resolveProject", () => {
  it("throws ProjectNotFoundError for an unknown UUID", async () => {
    const service = makeService();
    const unknownUUID = "00000000-0000-0000-0000-000000000000";

    await expect(service.resolveProject(unknownUUID)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe("StorageService.removeProject", () => {
  it("removes the project from the registry", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    // populate internal caches
    await service.index.rebuild(context);

    await service.removeProject(record.projectUUID);

    const projects = await service.listProjects();
    expect(projects.length).toBe(0);

    await expect(service.resolveProject(record.projectUUID)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });
});

describe("StorageService.fragments.discard", () => {
  it("moves a fragment to discarded/ using UUID lookup from the index", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const active = allFragments.filter((fragment) => !fragment.isDiscarded);
    expect(active.length).toBeGreaterThan(0);

    const target = active[0];
    if (!target) throw new Error("expected at least one active fragment in fixtures");

    await service.fragments.discard(context, target.uuid);

    const all = await service.fragments.readAll(context);
    const discarded = all.find((fragment) => fragment.uuid === target.uuid);
    expect(discarded?.isDiscarded).toBe(true);
  });

  it("throws FRAGMENT_NOT_FOUND when UUID is not in the index", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const unknownUUID = "00000000-0000-0000-0000-000000000000";
    await expect(service.fragments.discard(context, unknownUUID)).rejects.toMatchObject({
      code: "FRAGMENT_NOT_FOUND",
    });
  });
});

describe("StorageService.fragments.restore", () => {
  it("moves a discarded fragment back to fragments/ and marks it active", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const discarded = allFragments.find((fragment) => fragment.isDiscarded);
    if (!discarded) throw new Error("expected at least one discarded fragment in fixtures");

    await service.fragments.restore(context, discarded.uuid);

    const all = await service.fragments.readAll(context);
    const restored = all.find((fragment) => fragment.uuid === discarded.uuid);
    expect(restored?.isDiscarded).toBe(false);
  });

  it("throws FRAGMENT_NOT_FOUND when UUID is not in the index", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const unknownUUID = "00000000-0000-0000-0000-000000000000";
    await expect(service.fragments.restore(context, unknownUUID)).rejects.toMatchObject({
      code: "FRAGMENT_NOT_FOUND",
    });
  });

  it("throws FRAGMENT_NOT_DISCARDED when fragment is not discarded", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const active = allFragments.find((fragment) => !fragment.isDiscarded);
    if (!active) throw new Error("expected at least one active fragment in fixtures");

    await expect(service.fragments.restore(context, active.uuid)).rejects.toMatchObject({
      code: "FRAGMENT_NOT_DISCARDED",
    });
  });
});

describe("StorageService.fragments.write — rename cleanup", () => {
  it("deletes the old file when a fragment is renamed", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const indexed = allFragments.find((f) => !f.isDiscarded);
    if (!indexed) throw new Error("expected at least one active fragment in fixtures");

    const oldAbsolutePath = join(vaultDir, "fragments", indexed.filePath);
    const fragment = await service.fragments.read(context, indexed.uuid);

    const renamed = await service.fragments.write(context, {
      ...fragment,
      key: "completely-new-key",
    });

    expect(renamed.key).toBe("completely-new-key");
    expect(existsSync(join(vaultDir, "fragments", "completely-new-key.md"))).toBe(true);
    expect(existsSync(oldAbsolutePath)).toBe(false);
  });
});

describe("StorageService.fragments.write — key collision", () => {
  it("rejects a rename onto another active fragment's key without touching files", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const active = allFragments.filter((fragment) => !fragment.isDiscarded);
    const [first, second] = active;
    if (!first || !second) throw new Error("expected at least two active fragments in fixtures");

    const firstPath = join(vaultDir, "fragments", first.filePath);
    const secondPath = join(vaultDir, "fragments", second.filePath);
    const firstContentBefore = await Bun.file(firstPath).text();
    const secondContentBefore = await Bun.file(secondPath).text();

    const secondFragment = await service.fragments.read(context, second.uuid);

    await expect(
      service.fragments.write(context, { ...secondFragment, key: first.key }),
    ).rejects.toMatchObject({ code: "KEY_CONFLICT" });

    expect(await Bun.file(firstPath).text()).toBe(firstContentBefore);
    expect(await Bun.file(secondPath).text()).toBe(secondContentBefore);
  });

  it("collision check is case-insensitive", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const active = allFragments.filter((fragment) => !fragment.isDiscarded);
    const [first, second] = active;
    if (!first || !second) throw new Error("expected at least two active fragments in fixtures");

    const secondFragment = await service.fragments.read(context, second.uuid);

    await expect(
      service.fragments.write(context, { ...secondFragment, key: first.key.toUpperCase() }),
    ).rejects.toMatchObject({ code: "KEY_CONFLICT" });
  });

  it("active and discarded fragments may share a key", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir);
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const active = allFragments.find((fragment) => !fragment.isDiscarded);
    const discarded = allFragments.find((fragment) => fragment.isDiscarded);
    if (!active || !discarded) {
      throw new Error("expected at least one active and one discarded fragment in fixtures");
    }

    const activeFragment = await service.fragments.read(context, active.uuid);

    const renamed = await service.fragments.write(context, {
      ...activeFragment,
      key: discarded.key,
    });

    expect(renamed.key).toBe(discarded.key);
  });
});

describe("StorageService.listProjects", () => {
  it("returns all registered projects", async () => {
    const service = makeService();

    const secondVaultDir = join(tmpDir, "vault2");
    cpSync(BASIC_VAULT, secondVaultDir, { recursive: true });

    await service.registerProject("Alpha", vaultDir);
    await service.registerProject("Beta", secondVaultDir);

    const projects = await service.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((project) => project.name)).toContain("Alpha");
    expect(projects.map((project) => project.name)).toContain("Beta");
  });
});
