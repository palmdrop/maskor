import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { cpSync, mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { VaultSyncEvent } from "@maskor/shared";
import { BASIC_VAULT } from "@maskor/test-fixtures";
import { createStorageService } from "../../service/storage-service";
import { restoreAsideRoot, stagingRoot } from "../../drafts/paths";
import { DraftError } from "../../drafts/errors";

let tmpDir: string;
let vaultDir: string;
let configDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "maskor-drafts-service-test-"));
  vaultDir = join(tmpDir, "vault");
  configDir = join(tmpDir, "config");
  cpSync(BASIC_VAULT, vaultDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const makeService = () => createStorageService({ configDirectory: configDir });

describe("StorageService.drafts", () => {
  it("creates, lists, and deletes a draft", async () => {
    const service = makeService();
    const record = await service.registerProject("Test", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const created = await service.drafts.create(context, { name: "Snapshot A" });
    expect(created.name).toBe("Snapshot A");

    const list = await service.drafts.list(context);
    expect(list.map((draft) => draft.uuid)).toContain(created.uuid);

    const deleted = await service.drafts.delete(context, created.uuid);
    expect(deleted.uuid).toBe(created.uuid);
    const empty = await service.drafts.list(context);
    expect(empty).toHaveLength(0);
  });

  it("restores a draft, rebuilds the index, and emits vault:restored", async () => {
    const service = makeService();
    const record = await service.registerProject("Test", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const draft = await service.drafts.create(context, { name: "Before mutation" });

    // Mutate the live vault after the snapshot.
    const newFragmentPath = join(vaultDir, "fragments", "post-snapshot.md");
    await Bun.write(
      newFragmentPath,
      '---\nuuid: "22222222-2222-2222-2222-222222222222"\n---\n\nLive after snapshot.\n',
    );

    const events: VaultSyncEvent[] = [];
    const unsubscribe = service.watcher.subscribe(context, (event) => {
      events.push(event);
    });

    await service.drafts.restore(context, draft.uuid);
    unsubscribe();

    expect(existsSync(newFragmentPath)).toBe(false);
    expect(events.some((event) => event.type === "vault:restored")).toBe(true);
  });

  it("rejects a duplicate name (case-insensitive)", async () => {
    const service = makeService();
    const record = await service.registerProject("Test", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    await service.drafts.create(context, { name: "Draft 1" });
    let error: unknown;
    try {
      await service.drafts.create(context, { name: "draft 1" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DraftError);
    expect((error as DraftError).code).toBe("DRAFT_NAME_CONFLICT");
  });

  it("preserves action-log and project.json across restore", async () => {
    const service = makeService();
    const record = await service.registerProject("Test", vaultDir, "adopt");
    const context = await service.resolveProject(record.projectUUID);
    await service.index.rebuild(context);

    const draft = await service.drafts.create(context, { name: "Anchor" });

    // Append an entry to the live action-log AFTER the snapshot.
    await service.actionLog.append(context, {
      id: "post-snapshot",
      timestamp: new Date().toISOString(),
      correlationId: "corr-post-snapshot",
      type: "fragment:created",
      actor: "user",
      target: { type: "fragment", uuid: "post" },
      payload: {},
      undoable: false,
    });

    const logPath = join(vaultDir, ".maskor", "action-log.jsonl");
    const projectPath = join(vaultDir, ".maskor", "project.json");
    const logBefore = readFileSync(logPath, "utf8");
    const projectBefore = readFileSync(projectPath, "utf8");

    await service.drafts.restore(context, draft.uuid);

    expect(readFileSync(logPath, "utf8")).toBe(logBefore);
    expect(readFileSync(projectPath, "utf8")).toBe(projectBefore);
  });

  it("cleans up stale .staging and .restore-aside on resolveProject", async () => {
    const service = makeService();
    const record = await service.registerProject("Test", vaultDir, "adopt");
    mkdirSync(stagingRoot(vaultDir), { recursive: true });
    mkdirSync(restoreAsideRoot(vaultDir), { recursive: true });

    await service.resolveProject(record.projectUUID);

    expect(existsSync(stagingRoot(vaultDir))).toBe(false);
    expect(existsSync(restoreAsideRoot(vaultDir))).toBe(false);
  });
});
