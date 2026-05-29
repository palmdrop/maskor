import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createVault } from "../vault/markdown";
import { createVaultDatabase } from "../db/vault";
import { createVaultIndexer } from "../indexer/indexer";
import {
  insertWarning,
  listWarnings,
  dismissWarning,
  deleteStateWarnings,
  deleteStateWarningByKey,
  STATE_WARNING_KINDS,
} from "../warnings/warnings-repo";
import { BASIC_VAULT } from "@maskor/test-fixtures";

let tmpDir: string;
let vaultDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-warnings-test-"));
  vaultDir = join(tmpDir, "vault");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeDatabase = () => createVaultDatabase(vaultDir);
const makeIndexer = () => createVaultIndexer(makeDatabase(), createVault({ root: vaultDir }));

describe("warnings repo", () => {
  it("inserts and lists a warning", () => {
    const database = makeDatabase();
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/note.docx" });

    const warnings = listWarnings(database);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: "WRONG_FORMAT_FILE",
      filePath: "fragments/note.docx",
      category: "state",
    });
    expect(warnings[0]!.dismissedAt).toBeNull();
  });

  it("deduplicates state warnings by natural key", () => {
    const database = makeDatabase();
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/note.docx" });
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/note.docx" });
    expect(listWarnings(database)).toHaveLength(1);
  });

  it("keeps distinct rows for distinct event warnings", () => {
    const database = makeDatabase();
    insertWarning(database, {
      kind: "UUID_COLLISION",
      filePath: "fragments/a.md",
      collidingPath: "fragments/b.md",
      newUuid: "uuid-1",
    });
    insertWarning(database, {
      kind: "UUID_COLLISION",
      filePath: "fragments/c.md",
      collidingPath: "fragments/d.md",
      newUuid: "uuid-2",
    });
    expect(listWarnings(database)).toHaveLength(2);
  });

  it("excludes dismissed warnings from the list", () => {
    const database = makeDatabase();
    insertWarning(database, {
      kind: "UUID_COLLISION",
      filePath: "fragments/a.md",
      collidingPath: "fragments/b.md",
      newUuid: "uuid-1",
    });
    const id = listWarnings(database)[0]!.id;

    expect(dismissWarning(database, id)).toBe("dismissed");
    expect(listWarnings(database)).toHaveLength(0);
  });

  it("refuses to dismiss state warnings", () => {
    const database = makeDatabase();
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/note.docx" });
    const id = listWarnings(database)[0]!.id;

    expect(dismissWarning(database, id)).toBe("not_event");
    expect(listWarnings(database)).toHaveLength(1);
  });

  it("returns not_found for an unknown id", () => {
    const database = makeDatabase();
    expect(dismissWarning(database, "nonexistent")).toBe("not_found");
  });

  it("deleteStateWarnings clears only the given kinds", () => {
    const database = makeDatabase();
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/note.docx" });
    insertWarning(database, {
      kind: "UUID_COLLISION",
      filePath: "fragments/a.md",
      collidingPath: "fragments/b.md",
      newUuid: "uuid-1",
    });

    deleteStateWarnings(database, STATE_WARNING_KINDS);

    const remaining = listWarnings(database);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.kind).toBe("UUID_COLLISION");
  });

  it("deleteStateWarningByKey removes a single warning", () => {
    const database = makeDatabase();
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/a.docx" });
    insertWarning(database, { kind: "WRONG_FORMAT_FILE", filePath: "fragments/b.docx" });

    deleteStateWarningByKey(database, "WRONG_FORMAT_FILE", "fragments/a.docx");

    const remaining = listWarnings(database);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ filePath: "fragments/b.docx" });
  });
});

describe("rebuild warnings integration", () => {
  it("records WRONG_FORMAT_FILE warnings for non-.md files in entity folders", async () => {
    writeFileSync(join(vaultDir, "fragments", "scan.docx"), "binary");
    const indexer = makeIndexer();
    await indexer.rebuild();

    const warnings = listWarnings(makeDatabase());
    const wrongFormat = warnings.filter((warning) => warning.kind === "WRONG_FORMAT_FILE");
    expect(wrongFormat).toHaveLength(1);
    expect(wrongFormat[0]).toMatchObject({ filePath: "fragments/scan.docx" });
  });

  it("ignores dotfiles and .md files when scanning", async () => {
    writeFileSync(join(vaultDir, "fragments", ".DS_Store"), "");
    const indexer = makeIndexer();
    await indexer.rebuild();

    const warnings = listWarnings(makeDatabase());
    expect(warnings.filter((warning) => warning.kind === "WRONG_FORMAT_FILE")).toHaveLength(0);
  });

  it("clears and rebuilds state warnings on each rebuild", async () => {
    const docxPath = join(vaultDir, "fragments", "scan.docx");
    writeFileSync(docxPath, "binary");
    const indexer = makeIndexer();
    await indexer.rebuild();
    expect(
      listWarnings(makeDatabase()).filter((warning) => warning.kind === "WRONG_FORMAT_FILE"),
    ).toHaveLength(1);

    rmSync(docxPath);
    await indexer.rebuild();
    expect(
      listWarnings(makeDatabase()).filter((warning) => warning.kind === "WRONG_FORMAT_FILE"),
    ).toHaveLength(0);
  });

  it("preserves event warnings across a rebuild", async () => {
    const database = makeDatabase();
    insertWarning(database, {
      kind: "UUID_COLLISION",
      filePath: "fragments/a.md",
      collidingPath: "fragments/b.md",
      newUuid: "uuid-1",
    });

    const indexer = createVaultIndexer(database, createVault({ root: vaultDir }));
    await indexer.rebuild();

    const warnings = listWarnings(database);
    expect(warnings.filter((warning) => warning.kind === "UUID_COLLISION")).toHaveLength(1);
  });

  it("records a deduplicated UNKNOWN_ASPECT_KEY warning for a missing aspect key", async () => {
    const vault = createVault({ root: vaultDir });
    const fragments = await vault.fragments.readAll();
    for (const fragment of fragments.slice(0, 2)) {
      await vault.fragments.write({
        ...fragment,
        aspects: { ...fragment.aspects, "ghost-aspect": { weight: 0.5 } },
      });
    }

    const indexer = makeIndexer();
    await indexer.rebuild();

    const unknown = listWarnings(makeDatabase()).filter(
      (warning) => warning.kind === "UNKNOWN_ASPECT_KEY",
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ kind: "UNKNOWN_ASPECT_KEY", aspectKey: "ghost-aspect" });
    if (unknown[0]!.kind === "UNKNOWN_ASPECT_KEY") {
      expect(unknown[0]!.fragmentUuids).toHaveLength(2);
    }
  });
});
