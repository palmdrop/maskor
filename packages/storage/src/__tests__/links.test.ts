import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createVault } from "../vault/markdown";
import { createVaultDatabase, type VaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import { linksTable } from "../db/vault/schema";

let tmpDir: string;
let vaultDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-links-test-"));
  vaultDir = join(tmpDir, "vault");
  for (const dir of ["fragments", "notes", "references", "aspects"]) {
    mkdirSync(join(vaultDir, dir), { recursive: true });
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const writeFragment = (key: string, body: string, uuid: string = randomUUID()) => {
  const file = join(vaultDir, "fragments", `${key}.md`);
  writeFileSync(
    file,
    `---\nuuid: ${uuid}\nupdatedAt: "2026-06-16T00:00:00.000Z"\nreadiness: 0\nreferences: []\n---\n\n${body}\n`,
  );
  return { file, uuid };
};

const writeKeyed = (folder: string, key: string, body: string) => {
  const file = join(vaultDir, folder, `${key}.md`);
  writeFileSync(file, `---\nuuid: ${randomUUID()}\n---\n\n${body}\n`);
  return file;
};

const setup = () => {
  const vault = createVault({ root: vaultDir });
  const database = createVaultDatabase(vaultDir);
  const indexer = createVaultIndexer(database, vault);
  return { database, indexer };
};

const allLinks = (database: VaultDatabase) => database.select().from(linksTable).all();

describe("link table sync", () => {
  it("populates the table on rebuild and resolves existing targets", async () => {
    writeKeyed("notes", "setting-notes", "Setting prose.");
    writeFragment("chapter-1", "Opening that links [[notes/setting-notes]].");

    const { database, indexer } = setup();
    await indexer.rebuild();

    const links = allLinks(database);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      sourceType: "fragment",
      targetType: "note",
      targetKey: "setting-notes",
    });
    expect(links[0]!.targetUuid).not.toBeNull();
  });

  it("persists an unresolved link with a null targetUuid, then binds it when the target appears", async () => {
    writeFragment("chapter-1", "Refers to [[notes/does-not-exist]].");

    const { database, indexer } = setup();
    await indexer.rebuild();

    let links = allLinks(database);
    expect(links).toHaveLength(1);
    expect(links[0]!.targetType).toBe("note");
    expect(links[0]!.targetKey).toBe("does-not-exist");
    expect(links[0]!.targetUuid).toBeNull();

    // The target appears.
    writeKeyed("notes", "does-not-exist", "Now it exists.");
    await indexer.rebuild();

    links = allLinks(database);
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUuid).not.toBeNull();
  });

  it("un-binds a link when its target is deleted (row stays as a broken link)", async () => {
    writeKeyed("aspects", "the-river", "An aspect.");
    writeFragment("chapter-1", "Mentions [[aspects/the-river]].");

    const { database, indexer } = setup();
    await indexer.rebuild();
    expect(allLinks(database)[0]!.targetUuid).not.toBeNull();

    unlinkSync(join(vaultDir, "aspects", "the-river.md"));
    await indexer.rebuild();

    const links = allLinks(database);
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUuid).toBeNull();
    expect(links[0]!.targetType).toBe("aspect");
  });

  it("does not store a link with an unknown type prefix", async () => {
    writeFragment("chapter-1", "Bad [[gibberish/foo]] link.");

    const { database, indexer } = setup();
    await indexer.rebuild();

    expect(allLinks(database)).toHaveLength(0);
  });

  it("resolves a bare-name link uniquely across types", async () => {
    writeKeyed("notes", "harbour", "A note.");
    writeFragment("chapter-1", "See [[harbour]].");

    const { database, indexer } = setup();
    await indexer.rebuild();

    const links = allLinks(database);
    expect(links).toHaveLength(1);
    expect(links[0]!.targetType).toBe("note");
    expect(links[0]!.targetUuid).not.toBeNull();
  });

  it("indexes links from note and reference bodies too", async () => {
    writeKeyed("aspects", "memory", "Aspect.");
    writeKeyed("notes", "n1", "Note linking [[aspects/memory]].");
    writeKeyed("references", "r1", "Reference linking [[aspects/memory]].");

    const { database, indexer } = setup();
    await indexer.rebuild();

    const links = allLinks(database);
    expect(links.map((link) => link.sourceType).sort()).toEqual(["note", "reference"]);
  });

  it("findBacklinks returns referring bodies", async () => {
    writeKeyed("aspects", "memory", "Aspect.");
    writeFragment("chapter-1", "Links [[aspects/memory]].");

    const { indexer } = setup();
    await indexer.rebuild();

    const backlinks = await indexer.links.findBacklinks("aspect", "memory");
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]).toMatchObject({ sourceType: "fragment", sourceKey: "chapter-1" });
  });

  it("replaces a source's links when its body changes", async () => {
    writeKeyed("notes", "a", "A");
    writeKeyed("notes", "b", "B");
    const { file: fragmentFile, uuid } = writeFragment("chapter-1", "Links [[notes/a]].");

    const { database, indexer } = setup();
    await indexer.rebuild();
    expect(allLinks(database).map((link) => link.targetKey)).toEqual(["a"]);

    writeFileSync(
      fragmentFile,
      `---\nuuid: ${uuid}\nupdatedAt: "2026-06-16T00:00:00.000Z"\nreadiness: 0\nreferences: []\n---\n\nLinks [[notes/b]] now.\n`,
    );
    await indexer.rebuild();
    expect(allLinks(database).map((link) => link.targetKey)).toEqual(["b"]);
  });
});
