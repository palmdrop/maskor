import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as stringifyYaml } from "yaml";
import { createStorageService } from "../service/storage-service";
import { createVault } from "../vault/markdown";
import { BASIC_VAULT } from "@maskor/test-fixtures";

const BRIDGE_FRAGMENT_UUID = "f4c8c7ab-d6ed-44df-9763-5aabc98a3f2b";
const HARBOUR_FRAGMENT_UUID = "17ce3436-4426-4f4a-a60a-75dee958dd18";

let tmpDir: string;
let vaultDir: string;
let configDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-cascade-test-"));
  vaultDir = join(tmpDir, "vault");
  configDir = join(tmpDir, "config");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const setup = async () => {
  const service = createStorageService({ configDirectory: configDir });
  const record = await service.registerProject("Test", vaultDir);
  const context = await service.resolveProject(record.projectUUID);
  await service.index.rebuild(context);
  return { service, context, vault: createVault({ root: vaultDir }) };
};

// --- Note rename cascade ---

describe("cascadeNoteKeyRename — via notes.update", () => {
  it("updates the notes array in attached fragment files on disk", async () => {
    const { service, context, vault } = await setup();
    const notes = await service.notes.readAll(context);
    const bridgeNote = notes.find((note) => note.key === "bridge observation")!;

    await service.notes.update(context, bridgeNote.uuid, { key: "bridge notes" });

    const bridge = await vault.fragments.read("the-bridge.md");
    expect(bridge.notes).toContain("bridge notes");
    expect(bridge.notes).not.toContain("bridge observation");
  });

  it("returns affected fragment UUIDs in warnings", async () => {
    const { service, context } = await setup();
    const notes = await service.notes.readAll(context);
    const bridgeNote = notes.find((note) => note.key === "bridge observation")!;

    const result = await service.notes.update(context, bridgeNote.uuid, { key: "bridge notes" });

    expect(result.warnings.fragments).toContain(BRIDGE_FRAGMENT_UUID);
    expect(result.warnings.fragments).not.toContain(HARBOUR_FRAGMENT_UUID);
  });

  it("updates notes in all attached fragments (multiple)", async () => {
    const { service, context, vault } = await setup();

    // harbour-lights is attached to harbour observation
    const notes = await service.notes.readAll(context);
    const harbourNote = notes.find((note) => note.key === "harbour observation")!;

    const result = await service.notes.update(context, harbourNote.uuid, {
      key: "harbour notes",
    });

    expect(result.warnings.fragments).toContain(HARBOUR_FRAGMENT_UUID);
    const harbour = await vault.fragments.read("harbour-lights.md");
    expect(harbour.notes).toContain("harbour notes");
    expect(harbour.notes).not.toContain("harbour observation");
  });

  it("updates the notes array in attached aspect files on disk", async () => {
    const { service, context, vault } = await setup();

    // Attach the note to the grief aspect, then rebuild so the DB tracks it
    const aspects = await service.aspects.readAll(context);
    const grief = aspects.find((aspect) => aspect.key === "grief")!;
    await service.aspects.update(context, grief.uuid, { notes: ["bridge observation"] });

    const notes = await service.notes.readAll(context);
    const bridgeNote = notes.find((note) => note.key === "bridge observation")!;

    const result = await service.notes.update(context, bridgeNote.uuid, { key: "bridge notes" });

    expect(result.warnings.aspects).toContain(grief.uuid);
    const updatedGrief = await vault.aspects.read("grief.md");
    expect(updatedGrief.notes).toContain("bridge notes");
    expect(updatedGrief.notes).not.toContain("bridge observation");
  });

  it("returns empty warnings when note has no attachments", async () => {
    const { service, context } = await setup();

    // Create a standalone note with no fragment or aspect attachments
    await service.notes.write(context, {
      uuid: crypto.randomUUID(),
      key: "standalone note",
      content: "No attachments.",
    });

    const notes = await service.notes.readAll(context);
    const standalone = notes.find((note) => note.key === "standalone note")!;

    const result = await service.notes.update(context, standalone.uuid, { key: "renamed note" });

    expect(result.warnings.fragments).toHaveLength(0);
    expect(result.warnings.aspects).toHaveLength(0);
  });
});

// --- Reference rename cascade ---

describe("cascadeReferenceKeyRename — via references.update", () => {
  it("updates the references array in attached fragment files on disk", async () => {
    const { service, context, vault } = await setup();
    const references = await service.references.readAll(context);
    const cityRef = references.find((reference) => reference.key === "city research")!;

    await service.references.update(context, cityRef.uuid, { key: "city notes" });

    const bridge = await vault.fragments.read("the-bridge.md");
    expect(bridge.references).toContain("city notes");
    expect(bridge.references).not.toContain("city research");
  });

  it("returns affected fragment UUIDs in warnings", async () => {
    const { service, context } = await setup();
    const references = await service.references.readAll(context);
    const cityRef = references.find((reference) => reference.key === "city research")!;

    const result = await service.references.update(context, cityRef.uuid, { key: "city notes" });

    expect(result.warnings.fragments).toContain(BRIDGE_FRAGMENT_UUID);
    expect(result.warnings.fragments).not.toContain(HARBOUR_FRAGMENT_UUID);
  });

  it("returns empty warnings when reference has no attachments", async () => {
    const { service, context } = await setup();

    await service.references.write(context, {
      uuid: crypto.randomUUID(),
      key: "standalone ref",
      content: "No attachments.",
    });

    const references = await service.references.readAll(context);
    const standalone = references.find((reference) => reference.key === "standalone ref")!;

    const result = await service.references.update(context, standalone.uuid, {
      key: "renamed ref",
    });

    expect(result.warnings.fragments).toHaveLength(0);
  });
});

// --- Aspect rename cascade ---

describe("cascadeAspectKeyRename — via aspects.update", () => {
  it("renames inline fields in attached fragment files on disk", async () => {
    const { service, context, vault } = await setup();
    const aspects = await service.aspects.readAll(context);
    const grief = aspects.find((aspect) => aspect.key === "grief")!;

    await service.aspects.update(context, grief.uuid, { key: "sorrow" });

    const bridge = await vault.fragments.read("the-bridge.md");
    expect(bridge.properties["sorrow"]).toEqual({ weight: 0.6 });
    expect(bridge.properties["grief"]).toBeUndefined();
  });

  it("returns affected fragment UUIDs in warnings", async () => {
    const { service, context } = await setup();
    const aspects = await service.aspects.readAll(context);
    const grief = aspects.find((aspect) => aspect.key === "grief")!;

    const result = await service.aspects.update(context, grief.uuid, { key: "sorrow" });

    // Both the-bridge and harbour-lights have grief properties
    expect(result.warnings).toContain(BRIDGE_FRAGMENT_UUID);
    expect(result.warnings).toContain(HARBOUR_FRAGMENT_UUID);
  });

  it("renames the arc YAML file when one exists", async () => {
    const { service, context } = await setup();

    const arcsDir = join(vaultDir, ".maskor", "config", "arcs");
    await mkdir(arcsDir, { recursive: true });
    const arcUuid = crypto.randomUUID();
    await Bun.write(
      join(arcsDir, "grief.yaml"),
      stringifyYaml({
        uuid: arcUuid,
        aspectKey: "grief",
        points: [
          { x: 0, y: 0.5 },
          { x: 1, y: 0.5 },
        ],
      }),
    );

    const aspects = await service.aspects.readAll(context);
    const grief = aspects.find((aspect) => aspect.key === "grief")!;

    await service.aspects.update(context, grief.uuid, { key: "sorrow" });

    expect(await Bun.file(join(arcsDir, "grief.yaml")).exists()).toBe(false);
    expect(await Bun.file(join(arcsDir, "sorrow.yaml")).exists()).toBe(true);
  });

  it("updates the aspectKey field inside the renamed arc file", async () => {
    const { service, context } = await setup();

    const arcsDir = join(vaultDir, ".maskor", "config", "arcs");
    await mkdir(arcsDir, { recursive: true });
    const arcUuid = crypto.randomUUID();
    await Bun.write(
      join(arcsDir, "grief.yaml"),
      stringifyYaml({
        uuid: arcUuid,
        aspectKey: "grief",
        points: [
          { x: 0, y: 0.5 },
          { x: 1, y: 0.5 },
        ],
      }),
    );

    const aspects = await service.aspects.readAll(context);
    const grief = aspects.find((aspect) => aspect.key === "grief")!;

    await service.aspects.update(context, grief.uuid, { key: "sorrow" });

    const newArcContent = await Bun.file(join(arcsDir, "sorrow.yaml")).text();
    expect(newArcContent).toContain("aspectKey: sorrow");
  });

  it("does not create or error when no arc exists for the renamed aspect", async () => {
    const { service, context } = await setup();
    const aspects = await service.aspects.readAll(context);
    const grief = aspects.find((aspect) => aspect.key === "grief")!;

    // No arc file created — rename should succeed silently
    await expect(service.aspects.update(context, grief.uuid, { key: "sorrow" })).resolves.toBeDefined();
  });
});
