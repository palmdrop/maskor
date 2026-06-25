import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
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

describe("StorageService.index.reset", () => {
  const vaultDbPath = () => join(vaultDir, ".maskor", "vault.db");

  const markerExists = (): boolean => {
    const database = new Database(vaultDbPath(), { readonly: true });
    const row = database
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_reset_marker'")
      .get();
    database.close();
    return row !== null;
  };

  it("drops the DB, re-derives from the vault, and discards DB-only state", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    const baseline = await service.index.rebuild(context);
    expect(baseline.fragments).toBeGreaterThan(0);

    // Seed DB-only state (a table no vault file carries) through a separate connection.
    const seed = new Database(vaultDbPath());
    seed.exec("CREATE TABLE IF NOT EXISTS _reset_marker (x INTEGER)");
    seed.close();
    expect(markerExists()).toBe(true);

    const stats = await service.index.reset(context);

    // Re-derived: every entity count matches the prior rebuild.
    expect(stats.fragments).toBe(baseline.fragments);
    expect(stats.aspects).toBe(baseline.aspects);
    expect(stats.notes).toBe(baseline.notes);
    expect(stats.references).toBe(baseline.references);
    expect(stats.sequences).toBe(baseline.sequences);

    // The DB file was recreated (DB-only marker gone), and remains usable afterwards.
    expect(existsSync(vaultDbPath())).toBe(true);
    expect(markerExists()).toBe(false);
    const fragments = await service.fragments.readAll(context);
    expect(fragments.length).toBe(baseline.fragments);
  });

  it("leaves the service usable for a subsequent rebuild after a reset", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.reset(context);
    // Caches were dropped during reset — a follow-up rebuild must still work on the fresh handles.
    const stats = await service.index.rebuild(context);
    expect(stats.fragments).toBeGreaterThan(0);
  });

  // Invariant (never-lose-writing, Phase 5): a manual DB reset drops vault.db only — it MUST NOT
  // purge `.maskor/swap/`, the transient unsaved-content crash net. A user who triggers Reset
  // database while mid-edit must not lose the work in their open editor.
  it("leaves the unsaved-content swap files untouched", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const swapFile = join(vaultDir, ".maskor", "swap", "fragment", "open-fragment.json");
    mkdirSync(join(vaultDir, ".maskor", "swap", "fragment"), { recursive: true });
    const swapPayload = JSON.stringify({ content: "in-progress unsaved edits", savedAt: "now" });
    writeFileSync(swapFile, swapPayload);

    await service.index.reset(context);

    expect(existsSync(swapFile)).toBe(true);
    expect(readFileSync(swapFile, "utf8")).toBe(swapPayload);
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

describe("StorageService.fragments.write — createdAt preservation", () => {
  it("keeps createdAt stable across a content update while updatedAt advances", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);

    await service.index.rebuild(context);

    const allFragments = await service.fragments.readAll(context);
    const indexed = allFragments.find((fragment) => !fragment.isDiscarded);
    if (!indexed) throw new Error("expected at least one active fragment in fixtures");

    const fragment = await service.fragments.read(context, indexed.uuid);
    const originalCreatedAt = fragment.createdAt;

    const updated = await service.fragments.write(context, {
      ...fragment,
      content: `${fragment.content}\n\nAn appended line.`,
    });

    // createdAt is carried through verbatim; the write only advances updatedAt.
    expect(updated.createdAt.getTime()).toBe(originalCreatedAt.getTime());

    const reread = await service.fragments.read(context, fragment.uuid);
    expect(reread.createdAt.getTime()).toBe(originalCreatedAt.getTime());
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
  active: true,
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
        active: renamed.active,
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
      active: existing.active,
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

// A Margin follows its fragment through the lifecycle. These tests seed a Margin file on disk
// (Phase 1 has no service-level Margin write yet) and assert the fragment operations cascade it.
const seedMargin = (key: string, uuid: string) => {
  const dir = join(vaultDir, "margins");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${key}.md`),
    `---\nfragmentUuid: ${uuid}\n---\n## Notes\n\nseeded\n\n## Comments\n`,
  );
};

describe("StorageService.fragments — Margin lifecycle cascade", () => {
  it("renames the Margin file when the fragment is renamed", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const indexed = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded);
    if (!indexed) throw new Error("expected an active fragment");
    seedMargin(indexed.key, indexed.uuid);

    const fragment = await service.fragments.read(context, indexed.uuid);
    await service.fragments.write(context, { ...fragment, key: "renamed-key" });

    expect(existsSync(join(vaultDir, "margins", `${indexed.key}.md`))).toBe(false);
    expect(existsSync(join(vaultDir, "margins", "renamed-key.md"))).toBe(true);
  });

  it("moves the Margin into and back out of discarded/ with the fragment", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const indexed = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded);
    if (!indexed) throw new Error("expected an active fragment");
    seedMargin(indexed.key, indexed.uuid);

    await service.fragments.discard(context, indexed.uuid);
    expect(existsSync(join(vaultDir, "margins", `${indexed.key}.md`))).toBe(false);
    expect(existsSync(join(vaultDir, "margins", "discarded", `${indexed.key}.md`))).toBe(true);

    await service.fragments.restore(context, indexed.uuid);
    expect(existsSync(join(vaultDir, "margins", `${indexed.key}.md`))).toBe(true);
    expect(existsSync(join(vaultDir, "margins", "discarded", `${indexed.key}.md`))).toBe(false);
  });

  it("deletes the Margin when the fragment is permanently deleted", async () => {
    const service = makeService();
    const record = await service.registerProject("Test Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const indexed = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded);
    if (!indexed) throw new Error("expected an active fragment");
    seedMargin(indexed.key, indexed.uuid);

    await service.fragments.discard(context, indexed.uuid);
    await service.fragments.delete(context, indexed.uuid);
    expect(existsSync(join(vaultDir, "margins", "discarded", `${indexed.key}.md`))).toBe(false);
  });
});

import { buildCommentMarker, deriveExcerpt } from "@maskor/shared";

// Helpers: set up a project + an active fragment whose body carries a comment marker.
const setupMarginContext = async () => {
  const service = makeService();
  const record = await service.registerProject("Margin Project", vaultDir, "adopt");
  const context = await service.resolveProject(record.projectUUID);
  await service.index.rebuild(context);
  return { service, context };
};

describe("StorageService.margins — DB index & orphan detection", () => {
  it("rebuild indexes a Margin and round-trips its comments from the vault", async () => {
    const { service, context } = await setupMarginContext();

    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    const full = await service.fragments.read(context, fragment.uuid);

    // Two comments: one anchored to a marker present in the body, one whose marker is absent.
    await service.fragments.write(context, {
      ...full,
      content: `${full.content} ${buildCommentMarker("present")}`,
    });
    await service.margins.write(context, fragment.uuid, {
      notes: "Structural thoughts.",
      comments: [
        { markerId: "present", excerpt: "anchored", body: "bound" },
        { markerId: "gone", excerpt: "lost", body: "orphan" },
      ],
    });

    // Re-derive from the vault to prove the index is rebuilt, not just inline-written.
    await service.index.reset(context);

    const margin = await service.margins.read(context, fragment.uuid);
    expect(margin?.notes).toBe("Structural thoughts.");
    expect(margin?.comments.map((c) => c.markerId).sort()).toEqual(["gone", "present"]);
    // The orphaned comment keeps its frozen excerpt; the anchored one is derived from its block.
    expect(margin?.comments.find((c) => c.markerId === "gone")?.excerpt).toBe("lost");
  });

  it("refreshes an anchored comment's excerpt from its block opening on fragment save", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    const full = await service.fragments.read(context, fragment.uuid);

    // Anchor a comment to a block whose opening will change.
    await service.fragments.write(context, {
      ...full,
      content: `Original opening sentence. ${buildCommentMarker("anchor")}`,
    });
    await service.margins.write(context, fragment.uuid, {
      notes: "",
      comments: [{ markerId: "anchor", excerpt: "stale excerpt", body: "comment" }],
    });

    // Rewrite the block; the stored excerpt must follow the block's new opening.
    await service.fragments.write(context, {
      ...full,
      content: `A wholly rewritten opening line. ${buildCommentMarker("anchor")}`,
    });

    const margin = await service.margins.read(context, fragment.uuid);
    expect(margin?.comments[0]?.excerpt).toBe(deriveExcerpt("A wholly rewritten opening line."));
  });

  it("caps a refreshed excerpt at the block opening (ellipsis), not the whole block", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    const full = await service.fragments.read(context, fragment.uuid);

    const longBlock = "word ".repeat(40).trim();
    await service.fragments.write(context, {
      ...full,
      content: `${longBlock} ${buildCommentMarker("anchor")}`,
    });
    await service.margins.write(context, fragment.uuid, {
      notes: "",
      comments: [{ markerId: "anchor", excerpt: "x", body: "" }],
    });
    await service.fragments.write(context, {
      ...full,
      content: `${longBlock}! ${buildCommentMarker("anchor")}`,
    });

    const margin = await service.margins.read(context, fragment.uuid);
    expect(margin?.comments[0]?.excerpt.endsWith("…")).toBe(true);
    expect(margin!.comments[0]!.excerpt.length).toBeLessThanOrEqual(81);
  });

  it("freezes the excerpt once the comment is orphaned, and the round-trip preserves it", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    const full = await service.fragments.read(context, fragment.uuid);

    await service.fragments.write(context, {
      ...full,
      content: `Last known opening. ${buildCommentMarker("anchor")}`,
    });
    await service.margins.write(context, fragment.uuid, {
      notes: "",
      comments: [{ markerId: "anchor", excerpt: "stale", body: "comment" }],
    });
    // Save once while anchored to capture the live opening as the frozen value.
    await service.fragments.write(context, {
      ...full,
      content: `Last known opening. ${buildCommentMarker("anchor")}`,
    });
    const frozen = (await service.margins.read(context, fragment.uuid))!.comments[0]!.excerpt;
    expect(frozen).toBe(deriveExcerpt("Last known opening."));

    // Strip the marker → orphaned. The excerpt must not be recomputed or cleared.
    await service.fragments.write(context, { ...full, content: "Some other text entirely." });
    const afterOrphan = await service.margins.read(context, fragment.uuid);
    expect(afterOrphan?.comments[0]?.excerpt).toBe(frozen);

    // A vault → DB → vault rebuild keeps the frozen excerpt intact.
    await service.index.reset(context);
    const afterReset = await service.margins.read(context, fragment.uuid);
    expect(afterReset?.comments[0]?.excerpt).toBe(frozen);
  });

  it("write replaces the Margin's comment set (add then remove round-trips)", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;

    await service.margins.write(context, fragment.uuid, {
      notes: "",
      comments: [{ markerId: "c1", excerpt: "x", body: "first" }],
    });
    let margin = await service.margins.read(context, fragment.uuid);
    expect(margin?.comments.map((c) => c.markerId)).toEqual(["c1"]);

    await service.margins.write(context, fragment.uuid, { notes: "", comments: [] });
    margin = await service.margins.read(context, fragment.uuid);
    expect(margin?.comments).toEqual([]);
  });

  it("returns null reading a Margin that does not exist", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    expect(await service.margins.read(context, fragment.uuid)).toBeNull();
  });

  it("emits margin:synced when an API fragment edit refreshes an anchored comment's excerpt", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    const full = await service.fragments.read(context, fragment.uuid);

    await service.fragments.write(context, {
      ...full,
      content: `Original opening. ${buildCommentMarker("anchor")}`,
    });
    await service.margins.write(context, fragment.uuid, {
      notes: "",
      comments: [{ markerId: "anchor", excerpt: "Original opening.", body: "comment" }],
    });

    const syncedFragmentUuids: string[] = [];
    const unsubscribe = service.watcher.subscribe(context, (event) => {
      if (event.type === "margin:synced") syncedFragmentUuids.push(event.fragmentUuid);
    });

    // Rewrite the anchored block's opening — the stored excerpt is refreshed, so the inline write
    // rewrites the Margin file and emits margin:synced (the watcher's hash-guard would otherwise
    // suppress it). A pure orphan flip with no excerpt change emits nothing (orphan state is not
    // stored — the panel derives it live).
    await service.fragments.write(context, {
      ...full,
      content: `A rewritten opening. ${buildCommentMarker("anchor")}`,
    });
    unsubscribe();

    expect(syncedFragmentUuids).toContain(fragment.uuid);
  });
});

describe("StorageService.fragments — Margin index relocation (inline, no watcher)", () => {
  it("relocates the Margin index when the fragment is renamed", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    const full = await service.fragments.read(context, fragment.uuid);
    await service.margins.write(context, fragment.uuid, { notes: "kept", comments: [] });

    await service.fragments.write(context, { ...full, key: "renamed-for-margin" });

    // margins.read locates the file via the index; a stale index would point at the old path and
    // return null. A correct inline relocation finds the moved file.
    const margin = await service.margins.read(context, fragment.uuid);
    expect(margin?.fragmentKey).toBe("renamed-for-margin");
    expect(margin?.notes).toBe("kept");
  });

  it("moves the Margin index through discard and drops it on delete", async () => {
    const { service, context } = await setupMarginContext();
    const fragment = (await service.fragments.readAll(context)).find((f) => !f.isDiscarded)!;
    await service.margins.write(context, fragment.uuid, { notes: "kept", comments: [] });

    await service.fragments.discard(context, fragment.uuid);
    expect((await service.margins.read(context, fragment.uuid))?.notes).toBe("kept");

    await service.fragments.delete(context, fragment.uuid);
    expect(await service.margins.read(context, fragment.uuid)).toBeNull();
  });
});

describe("StorageService inline-link metadata auto-sync", () => {
  const setup = async () => {
    const service = makeService();
    const record = await service.registerProject("Links Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);
    return { service, context };
  };

  it("attaches an inline-linked reference and aspect on write", async () => {
    const { service, context } = await setup();
    const written = await service.fragments.write(
      context,
      {
        uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        key: "link-fragment",
        isDiscarded: false,
        readiness: 0,
        references: [],
        aspects: {},
        content: "Body links [[references/city research]] and [[aspects/grief]].",
        contentHash: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { contentChanged: true },
    );

    expect(written.references).toContain("city research");
    expect(written.aspects.grief).toEqual({ weight: 0 });

    // Re-read from the index to confirm it persisted.
    const reread = await service.fragments.read(context, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(reread.references).toContain("city research");
    expect(reread.aspects.grief).toEqual({ weight: 0 });
  });

  it("reaps a weight-0 aspect when its inline link is removed on a content save", async () => {
    const { service, context } = await setup();
    await service.fragments.write(
      context,
      {
        uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        key: "reap-fragment",
        isDiscarded: false,
        readiness: 0,
        references: [],
        aspects: {},
        content: "Has [[aspects/grief]].",
        contentHash: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { contentChanged: true },
    );

    const linked = await service.fragments.read(context, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(linked.aspects.grief).toEqual({ weight: 0 });

    // Remove the link in a content save — the weight-0 aspect is reaped.
    await service.fragments.write(
      context,
      { ...linked, content: "Link removed." },
      { contentChanged: true },
    );
    const reaped = await service.fragments.read(context, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(reaped.aspects.grief).toBeUndefined();
  });
});

describe("StorageService document-link rename cascade & backlinks", () => {
  const setup = async () => {
    const service = makeService();
    const record = await service.registerProject("Cascade Project", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);
    return { service, context };
  };

  const writeFrag = (
    service: ReturnType<typeof makeService>,
    context: any,
    uuid: string,
    key: string,
    content: string,
  ) =>
    service.fragments.write(
      context,
      {
        uuid,
        key,
        isDiscarded: false,
        readiness: 0,
        references: [],
        aspects: {},
        content,
        contentHash: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { contentChanged: true },
    );

  it("rewrites [[notes/old]] links (with aliases) in fragment and reference bodies on note rename", async () => {
    const { service, context } = await setup();
    const noteUuid = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    await service.notes.write(context, { uuid: noteUuid, key: "old-note", content: "Note body." });
    await writeFrag(
      service,
      context,
      "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "frag-a",
      "See [[notes/old-note|the manor]] and [[notes/old-note]].",
    );
    await service.references.write(context, {
      uuid: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      key: "ref-a",
      content: "Ref links [[notes/old-note]].",
    });

    await service.notes.update(context, noteUuid, { key: "new-note" });

    const frag = await service.fragments.read(context, "dddddddd-dddd-dddd-dddd-dddddddddddd");
    expect(frag.content).toContain("[[notes/new-note|the manor]]");
    expect(frag.content).toContain("[[notes/new-note]]");
    expect(frag.content).not.toContain("old-note");

    const ref = await service.references.read(context, "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    expect(ref.content).toContain("[[notes/new-note]]");

    const backlinks = await service.links.backlinks(context, "note", "new-note");
    expect(backlinks.map((b) => b.sourceType).sort()).toEqual(["fragment", "reference"]);
  });

  it("cascades a fragment rename to referring bodies (net-new)", async () => {
    const { service, context } = await setup();
    await writeFrag(
      service,
      context,
      "10101010-1010-1010-1010-101010101010",
      "target-frag",
      "I am the target.",
    );
    await writeFrag(
      service,
      context,
      "20202020-2020-2020-2020-202020202020",
      "referrer",
      "Points to [[fragments/target-frag]].",
    );

    const target = await service.fragments.read(context, "10101010-1010-1010-1010-101010101010");
    await service.fragments.write(
      context,
      { ...target, key: "renamed-target" },
      { contentChanged: false },
    );

    const referrer = await service.fragments.read(context, "20202020-2020-2020-2020-202020202020");
    expect(referrer.content).toContain("[[fragments/renamed-target]]");
  });

  it("on reference delete: strips the fragment attachment and leaves the inline link broken", async () => {
    const { service, context } = await setup();
    const refUuid = "30303030-3030-3030-3030-303030303030";
    await service.references.write(context, {
      uuid: refUuid,
      key: "doomed-ref",
      content: "A reference.",
    });
    await writeFrag(
      service,
      context,
      "40404040-4040-4040-4040-404040404040",
      "citing",
      "Cites [[references/doomed-ref]].",
    );

    // The inline link auto-attached the reference.
    const before = await service.fragments.read(context, "40404040-4040-4040-4040-404040404040");
    expect(before.references).toContain("doomed-ref");

    await service.references.delete(context, refUuid);

    const after = await service.fragments.read(context, "40404040-4040-4040-4040-404040404040");
    expect(after.references).not.toContain("doomed-ref");
    // The inline link stays in the body (broken).
    expect(after.content).toContain("[[references/doomed-ref]]");
  });
});
