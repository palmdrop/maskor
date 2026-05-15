import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createActionLogWriter } from "../../action-log/writer";
import type { LogEntry } from "@maskor/shared";

const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry =>
  ({
    id: "test-id",
    timestamp: "2026-05-08T10:00:00.000Z",
    type: "fragment:created",
    actor: "user",
    target: { type: "fragment", uuid: "uuid-1", key: "my-fragment" },
    payload: {},
    undoable: false,
    ...overrides,
  }) as LogEntry;

let temporaryDirectory: string;

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "maskor-writer-test-"));
});

afterEach(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("createActionLogWriter", () => {
  it("creates the .maskor directory if it does not exist", async () => {
    await createActionLogWriter({ vaultPath: temporaryDirectory });
    expect(existsSync(join(temporaryDirectory, ".maskor"))).toBe(true);
  });

  it("appends a valid JSONL line", async () => {
    const writer = await createActionLogWriter({ vaultPath: temporaryDirectory });
    const entry = makeEntry();
    await writer.append(entry);

    const content = readFileSync(join(temporaryDirectory, ".maskor", "action-log.jsonl"), "utf8");
    const lines = content.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ type: "fragment:created" });
  });

  it("auto-assigns id and timestamp when they are empty strings", async () => {
    const writer = await createActionLogWriter({ vaultPath: temporaryDirectory });
    const entry = makeEntry({ id: "", timestamp: "" });
    await writer.append(entry);

    const content = readFileSync(join(temporaryDirectory, ".maskor", "action-log.jsonl"), "utf8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).not.toBe("");
    expect(parsed.timestamp).not.toBe("");
  });

  it("increments the line counter after each append", async () => {
    const writer = await createActionLogWriter({ vaultPath: temporaryDirectory });
    await writer.append(makeEntry());
    await writer.append(makeEntry({ id: "test-2" }));

    const content = readFileSync(join(temporaryDirectory, ".maskor", "action-log.jsonl"), "utf8");
    const lines = content.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("rotates at the threshold and starts a fresh file", async () => {
    const writer = await createActionLogWriter({
      vaultPath: temporaryDirectory,
      rotationThreshold: 3,
    });
    for (let index = 0; index < 3; index++) {
      await writer.append(makeEntry({ id: `entry-${index}` }));
    }

    const maskorDir = join(temporaryDirectory, ".maskor");
    const files = (await import("node:fs")).readdirSync(maskorDir);
    const archives = files.filter(
      (file) => file.startsWith("action-log.") && file !== "action-log.jsonl",
    );
    expect(archives).toHaveLength(1);

    const currentContent = readFileSync(join(maskorDir, "action-log.jsonl"), "utf8");
    expect(currentContent.trim()).toBe("");
  });

  it("initializes counter from existing file on construction", async () => {
    const maskorDir = join(temporaryDirectory, ".maskor");
    await import("node:fs/promises").then((module_) =>
      module_.mkdir(maskorDir, { recursive: true }),
    );

    const existingLines =
      [
        JSON.stringify(makeEntry({ id: "existing-1" })),
        JSON.stringify(makeEntry({ id: "existing-2" })),
      ].join("\n") + "\n";
    writeFileSync(join(maskorDir, "action-log.jsonl"), existingLines);

    const writer = await createActionLogWriter({
      vaultPath: temporaryDirectory,
      rotationThreshold: 3,
    });
    await writer.append(makeEntry({ id: "new-entry" }));

    const files = (await import("node:fs")).readdirSync(maskorDir);
    const archives = files.filter(
      (file) => file.startsWith("action-log.") && file !== "action-log.jsonl",
    );
    expect(archives).toHaveLength(1);
  });

  it("throws on I/O failure (unwritable path)", async () => {
    const writer = await createActionLogWriter({ vaultPath: temporaryDirectory });
    const logPath = join(temporaryDirectory, ".maskor", "action-log.jsonl");
    await (await import("node:fs/promises")).chmod(logPath, 0o444);

    try {
      await expect(writer.append(makeEntry())).rejects.toThrow();
    } finally {
      await (await import("node:fs/promises")).chmod(logPath, 0o644);
    }
  });
});
