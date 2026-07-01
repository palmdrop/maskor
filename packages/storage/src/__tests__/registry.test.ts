import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRegistryDatabase } from "../db/registry";
import { createProjectRegistry } from "../registry/registry";
import { LOCAL_USER_UUID } from "../registry/types";
import { ProjectConflictError, ExistingVaultManifestError } from "../registry/errors";
import { BASIC_VAULT } from "@maskor/test-fixtures";

// Arbitrary fixed UUID used to assert the adopt path reuses the manifest's UUID verbatim.
const KNOWN_MANIFEST_UUID = "19a2045a-5902-435b-9a8b-adff93e6eef2";

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
    expect(manifest.config.editor.marginFontSize).toBe(15);
    expect(manifest.config.editor.maxParagraphWidth).toBe(72);
  });

  it("returns editor defaults from the manifest", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    expect(record.editor.vimMode).toBe(false);
    expect(record.editor.rawMarkdownMode).toBe(false);
    expect(record.editor.fontSize).toBe(16);
    expect(record.editor.marginFontSize).toBe(15);
    expect(record.editor.maxParagraphWidth).toBe(72);
    expect(record.editor.language).toBe("");
  });

  it("throws when vault path does not exist", async () => {
    const registry = makeRegistry();
    await expect(
      registry.registerProject("Bad Project", "/nonexistent/path", "adopt"),
    ).rejects.toThrow();
  });

  it("throws when vault path is a file, not a directory", async () => {
    const registry = makeRegistry();
    const filePath = join(vaultDir, "fragments", "the-bridge.md");
    await expect(registry.registerProject("Bad Project", filePath, "adopt")).rejects.toThrow();
  });

  it("reuses manifest UUID when adopting vault with existing project.json", async () => {
    const registry = makeRegistry();
    // `.maskor/` is gitignored, so the shared fixture cannot carry a tracked manifest — a fresh
    // clone would lose it. Build a manifest-bearing vault inline so the test is self-contained.
    const manifestVaultDir = join(tmpDir, "manifest-vault");
    mkdirSync(join(manifestVaultDir, ".maskor"), { recursive: true });
    writeFileSync(
      join(manifestVaultDir, ".maskor", "project.json"),
      JSON.stringify({
        projectUUID: KNOWN_MANIFEST_UUID,
        name: "Existing Project",
        registeredAt: new Date().toISOString(),
      }),
    );

    const record = await registry.registerProject("My Project", manifestVaultDir, "adopt");
    expect(record.projectUUID).toBe(KNOWN_MANIFEST_UUID);
  });

  it("assigns new UUID when adopting vault without existing project.json", async () => {
    const registry = makeRegistry();
    const emptyVaultDir = join(tmpDir, "empty-vault");
    mkdirSync(emptyVaultDir, { recursive: true });
    const record = await registry.registerProject("No Manifest Project", emptyVaultDir, "adopt");
    expect(record.projectUUID).toBeTruthy();
    // A UUID was generated — it won't match a manifest UUID
    expect(record.projectUUID).not.toBe(KNOWN_MANIFEST_UUID);
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

  it("mode create writes full vault skeleton on empty folder", async () => {
    const registry = makeRegistry();
    const newPath = join(tmpDir, "skeleton-project");
    await registry.registerProject("Skeleton Project", newPath, "create");
    expect(existsSync(join(newPath, ".maskor"))).toBe(true);
    expect(existsSync(join(newPath, "aspects"))).toBe(true);
    expect(existsSync(join(newPath, "fragments"))).toBe(true);
    expect(existsSync(join(newPath, "fragments", "discarded"))).toBe(true);
    expect(existsSync(join(newPath, "notes"))).toBe(true);
    expect(existsSync(join(newPath, "references"))).toBe(true);
    expect(existsSync(join(newPath, ".maskor", "sequences"))).toBe(true);
    expect(existsSync(join(newPath, ".maskor", "config"))).toBe(true);
  });

  it("mode create writes .maskor/project.json with correct contents", async () => {
    const registry = makeRegistry();
    const newPath = join(tmpDir, "manifest-project");
    const record = await registry.registerProject("Manifest Project", newPath, "create");

    const manifestFile = Bun.file(join(newPath, ".maskor", "project.json"));
    expect(await manifestFile.exists()).toBe(true);

    const manifest = await manifestFile.json();
    expect(manifest.projectUUID).toBe(record.projectUUID);
    expect(manifest.name).toBe("Manifest Project");
    expect(manifest.registeredAt).toBeTruthy();
    expect(manifest.config.editor.vimMode).toBe(false);
    expect(manifest.config.editor.rawMarkdownMode).toBe(false);
    expect(manifest.config.editor.fontSize).toBe(16);
    expect(manifest.config.editor.maxParagraphWidth).toBe(72);
    expect(manifest.config.suggestion.readinessThreshold).toBe(0.95);
  });

  it("mode create on already-initialized folder throws ExistingVaultManifestError", async () => {
    const registry = makeRegistry();
    const newPath = join(tmpDir, "idempotent-project");
    const record = await registry.registerProject("Original Name", newPath, "create");

    // Deregister — vault files remain on disk
    await registry.removeProject(record.projectUUID);

    // Attempting mode: "create" again must reject — caller should use mode: "adopt" instead
    await expect(
      registry.registerProject("Different Name", newPath, "create"),
    ).rejects.toBeInstanceOf(ExistingVaultManifestError);
  });

  it("throws ProjectConflictError when vaultPath already registered", async () => {
    const registry = makeRegistry();
    await registry.registerProject("First", vaultDir, "adopt");
    await expect(registry.registerProject("Second", vaultDir, "adopt")).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
  });

  it("mode create pre-checks DB uniqueness before writing to filesystem", async () => {
    const registry = makeRegistry();
    const newPath = join(tmpDir, "duplicate-path-test");
    await registry.registerProject("First", newPath, "create");

    // Attempting mode: "create" on the same registered path must throw before FS writes
    await expect(registry.registerProject("Second", newPath, "create")).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
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

  it("updates preview config and persists to manifest", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    const updated = await registry.updateProject(record.projectUUID, {
      preview: { showTitles: true, separator: "horizontal-rule" },
    });

    expect(updated.preview.showTitles).toBe(true);
    expect(updated.preview.separator).toBe("horizontal-rule");
    expect(updated.preview.showSectionHeadings).toBe(true);

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.config.preview.showTitles).toBe(true);
    expect(manifest.config.preview.separator).toBe("horizontal-rule");
  });

  it("updates overview detail level and persists to manifest", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");
    const updated = await registry.updateProject(record.projectUUID, {
      overview: { detailLevel: "excerpt" },
    });

    expect(updated.overview.detailLevel).toBe("excerpt");

    const manifest = await Bun.file(join(vaultDir, ".maskor", "project.json")).json();
    expect(manifest.config.overview.detailLevel).toBe("excerpt");
  });
});

describe("registry preview defaults", () => {
  it("returns preview defaults when project.json has no preview field", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    // Remove preview config from manifest to simulate an older project.json
    const manifestPath = join(vaultDir, ".maskor", "project.json");
    const manifest = await Bun.file(manifestPath).json();
    delete manifest.config.preview;
    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

    const found = await registry.findByUUID(record.projectUUID);
    expect(found?.preview.showTitles).toBe(false);
    expect(found?.preview.showSectionHeadings).toBe(true);
    expect(found?.preview.separator).toBe("blank-line");
  });
});

describe("registry overview defaults", () => {
  it("returns overview defaults when project.json has no overview field", async () => {
    const registry = makeRegistry();
    const record = await registry.registerProject("My Project", vaultDir, "adopt");

    // Remove overview config from manifest to simulate an older project.json
    const manifestPath = join(vaultDir, ".maskor", "project.json");
    const manifest = await Bun.file(manifestPath).json();
    if (manifest.config) delete manifest.config.overview;
    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

    const found = await registry.findByUUID(record.projectUUID);
    expect(found?.overview.detailLevel).toBe("prose");
  });
});

describe("registry config defaults", () => {
  it("applies all section defaults when config is entirely absent from manifest", async () => {
    const registry = makeRegistry();
    const emptyVaultDir = join(tmpDir, "no-config-vault");
    mkdirSync(emptyVaultDir, { recursive: true });
    // Write a bare manifest with no config key
    await Bun.write(
      join(emptyVaultDir, ".maskor", "project.json"),
      JSON.stringify({
        projectUUID: crypto.randomUUID(),
        name: "Bare",
        registeredAt: new Date().toISOString(),
      }),
    );
    await registry.registerProject("Bare", emptyVaultDir, "adopt");
    const found = await registry.findByUUID(
      (await Bun.file(join(emptyVaultDir, ".maskor", "project.json")).json()).projectUUID,
    );
    expect(found?.editor.vimMode).toBe(false);
    expect(found?.editor.fontSize).toBe(16);
    expect(found?.suggestion.readinessThreshold).toBe(0.95);
    expect(found?.advanced.showFragmentStats).toBe(false);
    expect(found?.preview.separator).toBe("blank-line");
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
