import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStorageService } from "../service/storage-service";
import { ProjectNotFoundError } from "../registry/errors";
import { LOCAL_USER_UUID } from "../registry/types";
import type { Sequence } from "@maskor/shared";
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");

    const context = await service.resolveProject(record.projectUUID);
    expect(context.projectUUID).toBe(record.projectUUID);
    expect(context.vaultPath).toBe(vaultDir);
    expect(context.userUUID).toBe(LOCAL_USER_UUID);
  });

  it("can read fragments after rebuild", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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

  it("lazily creates missing skeleton dirs for vaults that predate full skeleton bootstrap", async () => {
    // Create a minimal vault (only .maskor/) to simulate a vault registered before full skeleton.
    const minimalVaultDir = join(tmpDir, "minimal-vault");
    mkdirSync(join(minimalVaultDir, ".maskor"), { recursive: true });

    const service = makeService();
    const record = await service.registerProject("Minimal Project", minimalVaultDir, "adopt");
    await service.resolveProject(record.projectUUID);

    expect(existsSync(join(minimalVaultDir, "fragments"))).toBe(true);
    expect(existsSync(join(minimalVaultDir, "fragments", "discarded"))).toBe(true);
    expect(existsSync(join(minimalVaultDir, "aspects"))).toBe(true);
    expect(existsSync(join(minimalVaultDir, "notes"))).toBe(true);
    expect(existsSync(join(minimalVaultDir, "references"))).toBe(true);
    expect(existsSync(join(minimalVaultDir, ".maskor", "sequences"))).toBe(true);
    expect(existsSync(join(minimalVaultDir, ".maskor", "config"))).toBe(true);
  });
});

describe("StorageService.removeProject", () => {
  it("removes the project from the registry", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const unknownUUID = "00000000-0000-0000-0000-000000000000";
    await expect(service.fragments.restore(context, unknownUUID)).rejects.toMatchObject({
      code: "FRAGMENT_NOT_FOUND",
    });
  });

  it("throws FRAGMENT_NOT_DISCARDED when fragment is not discarded", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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

describe("StorageService.fragments.write — case-only rename", () => {
  it("preserves fragment UUID and content when key changes only in case", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const indexed = allFragments.find((fragment) => !fragment.isDiscarded);
    if (!indexed) throw new Error("expected at least one active fragment in fixtures");

    const fragment = await service.fragments.read(context, indexed.uuid);
    const newKey = fragment.key.toUpperCase();

    const renamed = await service.fragments.write(context, { ...fragment, key: newKey });

    expect(renamed.uuid).toBe(fragment.uuid);
    expect(renamed.key).toBe(newKey);

    // The file must be listed under the new case — use readdirSync (not existsSync) because
    // existsSync is case-insensitive on macOS and would return true for the old name too.
    const activeFiles = readdirSync(join(vaultDir, "fragments"));
    expect(activeFiles).toContain(`${newKey}.md`);
    expect(activeFiles).not.toContain(`${fragment.key}.md`);

    // Fragment must still be readable by UUID after the case-only rename.
    const reread = await service.fragments.read(context, fragment.uuid);
    expect(reread.uuid).toBe(fragment.uuid);
    expect(reread.key).toBe(newKey);
  });
});

describe("StorageService keyed-entity update — case-only rename", () => {
  it("preserves note UUID and content when key changes only in case", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const [indexed] = await service.notes.readAll(context);
    if (!indexed) throw new Error("expected at least one note in fixtures");

    const before = await service.notes.read(context, indexed.uuid);
    const newKey = before.key.toUpperCase();
    const directory = join(vaultDir, "notes", indexed.filePath.split("/").slice(0, -1).join("/"));

    const { note } = await service.notes.update(context, indexed.uuid, { key: newKey });

    expect(note.uuid).toBe(before.uuid);
    expect(note.key).toBe(newKey);

    // readdirSync (not existsSync) — existsSync is case-insensitive on macOS.
    const files = readdirSync(directory);
    expect(files).toContain(`${newKey}.md`);
    expect(files).not.toContain(`${before.key}.md`);

    const reread = await service.notes.read(context, before.uuid);
    expect(reread.uuid).toBe(before.uuid);
    expect(reread.key).toBe(newKey);
    expect(reread.content).toBe(before.content);
  });

  it("preserves reference UUID and content when key changes only in case", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const [indexed] = await service.references.readAll(context);
    if (!indexed) throw new Error("expected at least one reference in fixtures");

    const before = await service.references.read(context, indexed.uuid);
    const newKey = before.key.toUpperCase();
    const directory = join(
      vaultDir,
      "references",
      indexed.filePath.split("/").slice(0, -1).join("/"),
    );

    const { reference } = await service.references.update(context, indexed.uuid, { key: newKey });

    expect(reference.uuid).toBe(before.uuid);
    expect(reference.key).toBe(newKey);

    const files = readdirSync(directory);
    expect(files).toContain(`${newKey}.md`);
    expect(files).not.toContain(`${before.key}.md`);

    const reread = await service.references.read(context, before.uuid);
    expect(reread.uuid).toBe(before.uuid);
    expect(reread.key).toBe(newKey);
    expect(reread.content).toBe(before.content);
  });

  it("preserves aspect UUID when key changes only in case (within a category subfolder)", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allAspects = await service.aspects.readAll(context);
    const indexed = allAspects.find((aspect) => aspect.filePath.includes("/"));
    if (!indexed) throw new Error("expected at least one categorised aspect in fixtures");

    const before = await service.aspects.read(context, indexed.uuid);
    const newKey = before.key.toUpperCase();
    const directory = join(vaultDir, "aspects", indexed.filePath.split("/").slice(0, -1).join("/"));

    const { aspect } = await service.aspects.update(context, indexed.uuid, { key: newKey });

    expect(aspect.uuid).toBe(before.uuid);
    expect(aspect.key).toBe(newKey);

    const files = readdirSync(directory);
    expect(files).toContain(`${newKey}.md`);
    expect(files).not.toContain(`${before.key}.md`);

    const reread = await service.aspects.read(context, before.uuid);
    expect(reread.uuid).toBe(before.uuid);
    expect(reread.key).toBe(newKey);
  });
});

describe("StorageService keyed-entity update — key collision", () => {
  it("rejects renaming a note onto another note's key without touching files", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const notes = await service.notes.readAll(context);
    const [first, second] = notes;
    if (!first || !second) throw new Error("expected at least two notes in fixtures");

    const firstPath = join(vaultDir, "notes", first.filePath);
    const secondPath = join(vaultDir, "notes", second.filePath);
    const firstContentBefore = await Bun.file(firstPath).text();
    const secondContentBefore = await Bun.file(secondPath).text();

    await expect(
      service.notes.update(context, second.uuid, { key: first.key }),
    ).rejects.toMatchObject({ code: "KEY_CONFLICT" });

    expect(await Bun.file(firstPath).text()).toBe(firstContentBefore);
    expect(await Bun.file(secondPath).text()).toBe(secondContentBefore);
  });

  it("rejects renaming an aspect onto another aspect's key across categories", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const aspects = await service.aspects.readAll(context);
    const [first, second] = aspects;
    if (!first || !second) throw new Error("expected at least two aspects in fixtures");

    // Keys are unique per entity type globally — a collision across category
    // subfolders must still be rejected.
    await expect(
      service.aspects.update(context, second.uuid, { key: first.key }),
    ).rejects.toMatchObject({ code: "KEY_CONFLICT" });
  });

  it("rejects renaming a reference onto another reference's key", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    // Fixtures ship a single reference; add a second so we can force a collision.
    await service.references.write(context, {
      uuid: crypto.randomUUID(),
      key: "second source",
      content: "placeholder",
    });

    const references = await service.references.readAll(context);
    const [first, second] = references;
    if (!first || !second) throw new Error("expected two references after seeding");

    await expect(
      service.references.update(context, second.uuid, { key: first.key }),
    ).rejects.toMatchObject({ code: "KEY_CONFLICT" });
  });

  it("collision check is case-insensitive on update", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const notes = await service.notes.readAll(context);
    const [first, second] = notes;
    if (!first || !second) throw new Error("expected at least two notes in fixtures");

    await expect(
      service.notes.update(context, second.uuid, { key: first.key.toUpperCase() }),
    ).rejects.toMatchObject({ code: "KEY_CONFLICT" });
  });
});

describe("StorageService.fragments.write — key collision", () => {
  it("rejects a rename onto another active fragment's key without touching files", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
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

    // Use a fresh empty directory for the second vault — both copies of BASIC_VAULT share the
    // same manifest UUID, so registering two copies causes a UUID primary key conflict.
    const secondVaultDir = join(tmpDir, "vault2");
    mkdirSync(secondVaultDir, { recursive: true });

    await service.registerProject("Alpha", vaultDir, "adopt");
    await service.registerProject("Beta", secondVaultDir, "adopt");

    const projects = await service.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((project) => project.name)).toContain("Alpha");
    expect(projects.map((project) => project.name)).toContain("Beta");
  });
});

// --- sequences ---

const makeSequence = (projectUuid: string, overrides: Partial<Sequence> = {}): Sequence => ({
  uuid: "bbbbbbbb-0000-0000-0000-000000000000",
  name: "Main",
  isMain: true,
  projectUuid,
  sections: [],
  ...overrides,
});

const setupSequenceContext = async () => {
  const service = makeService();
  const record = await service.registerProject("Test", vaultDir, "adopt");
  const context = await service.resolveProject(record.projectUUID);
  await service.index.rebuild(context);
  return { service, context };
};

describe("StorageService.sequences.write + read", () => {
  it("writes a sequence and reads it back by UUID", async () => {
    const { service, context } = await setupSequenceContext();
    const sequence = makeSequence(context.projectUUID);

    await service.sequences.write(context, sequence);
    const found = await service.sequences.read(context, sequence.uuid);

    expect(found.uuid).toBe(sequence.uuid);
    expect(found.name).toBe("Main");
    expect(found.isMain).toBe(true);
  });

  it("throws SEQUENCE_NOT_FOUND for an unknown UUID", async () => {
    const { service, context } = await setupSequenceContext();
    const unknownUuid = "00000000-0000-0000-0000-000000000000";

    await expect(service.sequences.read(context, unknownUuid)).rejects.toMatchObject({
      code: "SEQUENCE_NOT_FOUND",
    });
  });

  it("throws KEY_CONFLICT when a second sequence uses the same name", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));

    const duplicate = makeSequence(context.projectUUID, {
      uuid: "cccccccc-0000-0000-0000-000000000000",
      name: "Main",
      isMain: false,
    });

    await expect(service.sequences.write(context, duplicate)).rejects.toMatchObject({
      code: "KEY_CONFLICT",
      context: { reason: "name_conflict" },
    });
  });

  it("allows two sequences whose names differ only by case (case-sensitive comparison)", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));

    const differentCase = makeSequence(context.projectUUID, {
      uuid: "cccccccc-0000-0000-0000-000000000000",
      name: "main",
      isMain: false,
    });

    await service.sequences.write(context, differentCase);
    const all = await service.sequences.readAll(context);
    expect(all.map((s) => s.name).sort()).toEqual(["Main", "main"]);
  });

  it("rejects a rename that collides with another sequence's name", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));
    await service.sequences.write(
      context,
      makeSequence(context.projectUUID, {
        uuid: "cccccccc-0000-0000-0000-000000000000",
        name: "Secondary",
        isMain: false,
      }),
    );

    const renamed = await service.sequences.read(context, "cccccccc-0000-0000-0000-000000000000");
    await expect(
      service.sequences.write(context, {
        uuid: renamed.uuid,
        name: "Main",
        isMain: renamed.isMain,
        projectUuid: renamed.projectUuid,
        sections: renamed.sections,
      }),
    ).rejects.toMatchObject({
      code: "KEY_CONFLICT",
      context: { reason: "name_conflict" },
    });
  });

  it("allows writing a sequence with its own existing name (self-rename no-op is permitted)", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));

    const existing = await service.sequences.read(context, "bbbbbbbb-0000-0000-0000-000000000000");

    await service.sequences.write(context, {
      uuid: existing.uuid,
      name: existing.name,
      isMain: existing.isMain,
      projectUuid: existing.projectUuid,
      sections: existing.sections,
    });

    const reread = await service.sequences.read(context, existing.uuid);
    expect(reread.name).toBe(existing.name);
  });

  it("throws KEY_CONFLICT when a second isMain=true sequence is written while one already exists", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));

    const secondMain = makeSequence(context.projectUUID, {
      uuid: "cccccccc-0000-0000-0000-000000000000",
      name: "Secondary",
      isMain: true,
    });

    await expect(service.sequences.write(context, secondMain)).rejects.toMatchObject({
      code: "KEY_CONFLICT",
    });
  });
});

describe("StorageService.sequences.readAll + getMain", () => {
  it("readAll returns all sequences", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));

    const all = await service.sequences.readAll(context);
    expect(all).toHaveLength(1);
  });

  it("getMain returns the main sequence", async () => {
    const { service, context } = await setupSequenceContext();
    await service.sequences.write(context, makeSequence(context.projectUUID));

    const main = await service.sequences.getMain(context);
    expect(main?.uuid).toBe("bbbbbbbb-0000-0000-0000-000000000000");
  });

  it("getMain returns null when no main exists", async () => {
    const { service, context } = await setupSequenceContext();

    const main = await service.sequences.getMain(context);
    expect(main).toBeNull();
  });
});

describe("StorageService.sequences.delete", () => {
  it("deletes a sequence and it is no longer findable", async () => {
    const { service, context } = await setupSequenceContext();
    const sequence = makeSequence(context.projectUUID);
    await service.sequences.write(context, sequence);

    await service.sequences.delete(context, sequence.uuid);

    const all = await service.sequences.readAll(context);
    expect(all).toHaveLength(0);
  });

  it("throws SEQUENCE_NOT_FOUND when deleting an unknown UUID", async () => {
    const { service, context } = await setupSequenceContext();

    await expect(
      service.sequences.delete(context, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "SEQUENCE_NOT_FOUND" });
  });
});

describe("StorageService.sequences.setMain", () => {
  it("promotes a non-main sequence to main and demotes the old main", async () => {
    const { service, context } = await setupSequenceContext();

    const firstMain = makeSequence(context.projectUUID);
    await service.sequences.write(context, firstMain);

    const second = makeSequence(context.projectUUID, {
      uuid: "cccccccc-0000-0000-0000-000000000000",
      name: "Secondary",
      isMain: false,
    });
    await service.sequences.write(context, second);

    await service.sequences.setMain(context, second.uuid);

    const newMain = await service.sequences.getMain(context);
    expect(newMain?.uuid).toBe(second.uuid);

    const oldMain = await service.sequences.read(context, firstMain.uuid);
    expect(oldMain.isMain).toBe(false);
  });

  it("is a no-op when the sequence is already main", async () => {
    const { service, context } = await setupSequenceContext();
    const sequence = makeSequence(context.projectUUID);
    await service.sequences.write(context, sequence);

    await service.sequences.setMain(context, sequence.uuid);

    const main = await service.sequences.getMain(context);
    expect(main?.uuid).toBe(sequence.uuid);
  });

  it("throws SEQUENCE_NOT_FOUND for an unknown UUID", async () => {
    const { service, context } = await setupSequenceContext();

    await expect(
      service.sequences.setMain(context, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ code: "SEQUENCE_NOT_FOUND" });
  });
});
