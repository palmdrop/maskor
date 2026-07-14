import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readRecentEntries } from "../../action-log/reader";
import type { LogEntry } from "@maskor/shared";

const makeEntry = (id: string): LogEntry =>
  ({
    id,
    timestamp: `2026-05-08T10:00:0${id}.000Z`,
    correlationId: `corr-${id}`,
    type: "fragment:created",
    actor: "user",
    target: { type: "fragment", uuid: `uuid-${id}`, key: `fragment-${id}` },
    payload: {},
    undoable: false,
  }) as unknown as LogEntry;

const writeLog = (vaultPath: string, lines: string[]) => {
  const maskorDir = join(vaultPath, ".maskor");
  mkdirSync(maskorDir, { recursive: true });
  writeFileSync(join(maskorDir, "action-log.jsonl"), lines.join("\n") + "\n");
};

let temporaryDirectory: string;

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "maskor-reader-test-"));
});

afterEach(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("readRecentEntries", () => {
  it("returns empty array when file does not exist", async () => {
    const entries = await readRecentEntries(temporaryDirectory, 10);
    expect(entries).toEqual([]);
  });

  it("returns entries most-recent-first", async () => {
    writeLog(temporaryDirectory, [
      JSON.stringify(makeEntry("1")),
      JSON.stringify(makeEntry("2")),
      JSON.stringify(makeEntry("3")),
    ]);

    const entries = await readRecentEntries(temporaryDirectory, 10);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.id).toBe("3");
    expect(entries[2]!.id).toBe("1");
  });

  it("respects the limit (tail of file)", async () => {
    writeLog(temporaryDirectory, [
      JSON.stringify(makeEntry("1")),
      JSON.stringify(makeEntry("2")),
      JSON.stringify(makeEntry("3")),
      JSON.stringify(makeEntry("4")),
    ]);

    const entries = await readRecentEntries(temporaryDirectory, 2);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe("4");
    expect(entries[1]!.id).toBe("3");
  });

  it("keeps legacy sequence:exported entries missing the annotation-toggle fields", async () => {
    // Written before `includeReferences`/`includeMarginAnnotations` existed. Both
    // are optional, so the entry must still validate and be returned.
    const legacyExport = {
      id: "5",
      timestamp: "2026-05-08T10:00:05.000Z",
      correlationId: "corr-5",
      type: "sequence:exported",
      actor: "user",
      target: { type: "sequence", uuid: "seq-1", key: "main" },
      undoable: false,
      payload: {
        sequenceName: "Main",
        format: "md",
        fileName: "main.md",
        archivePath: ".maskor/exports/main.md",
        fragmentCount: 3,
      },
    };
    writeLog(temporaryDirectory, [JSON.stringify(legacyExport)]);

    const entries = await readRecentEntries(temporaryDirectory, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe("5");
    expect(entries[0]!.type).toBe("sequence:exported");
  });

  it("skips malformed lines and returns valid ones", async () => {
    writeLog(temporaryDirectory, [
      JSON.stringify(makeEntry("1")),
      "not valid json {{",
      JSON.stringify(makeEntry("3")),
    ]);

    const entries = await readRecentEntries(temporaryDirectory, 10);
    expect(entries).toHaveLength(2);
    const ids = entries.map((entry) => entry.id);
    expect(ids).toContain("1");
    expect(ids).toContain("3");
  });
});
