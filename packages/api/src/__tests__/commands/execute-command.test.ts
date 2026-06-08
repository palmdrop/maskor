import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestApp } from "../helpers/create-test-app";
import { seedVault } from "../helpers/seed-vault";
import type { ProjectRecord } from "@maskor/storage";
import type { CommandContext } from "../../commands/types";
import { executeCommand } from "../../commands/types";
import type { Command } from "../../commands/types";
import type { Logger } from "@maskor/shared/logger";

const makeLogger = (): Logger & { errors: unknown[] } => {
  const errors: unknown[] = [];
  const noOp = () => {};
  return {
    errors,
    info: noOp,
    warn: noOp,
    debug: noOp,
    error: (...args: unknown[]) => errors.push(args),
    child: () => makeLogger(),
  } as unknown as Logger & { errors: unknown[] };
};

let testContext: ReturnType<typeof createTestApp>;
let project: ProjectRecord;

beforeAll(async () => {
  testContext = createTestApp();
  const seeded = await seedVault(testContext.storageService, testContext.temporaryDirectory);
  project = seeded.project;
});

afterAll(async () => {
  await testContext.cleanup();
});

describe("executeCommand", () => {
  it("returns mutation result on success", async () => {
    const context = await testContext.storageService.resolveProject(project.projectUUID);
    const logger = makeLogger();

    const command: Command<string, string> = {
      async execute(_ctx, input) {
        return { result: `ok:${input}`, logEntries: [] };
      },
    };

    const commandContext: CommandContext = {
      storageService: testContext.storageService,
      projectContext: context,
      actor: "user",
      logger,
      correlationId: "test-correlation",
    };

    const result = await executeCommand(command, "fragment:update", commandContext, "hello");
    expect(result).toBe("ok:hello");
  });

  it("appends a command:error entry and re-throws on mutation failure", async () => {
    const context = await testContext.storageService.resolveProject(project.projectUUID);
    const logger = makeLogger();

    const command: Command<void, void> = {
      async execute() {
        throw new Error("mutation failed");
      },
    };

    const commandContext: CommandContext = {
      storageService: testContext.storageService,
      projectContext: context,
      actor: "user",
      logger,
      correlationId: "test-correlation",
    };

    const appended: { type: string; payload: unknown; correlationId: string }[] = [];
    const originalAppend = testContext.storageService.actionLog.append;
    testContext.storageService.actionLog.append = async (_projectContext, entry) => {
      appended.push(entry as never);
    };

    await expect(
      executeCommand(command, "fragment:update", commandContext, undefined),
    ).rejects.toThrow("mutation failed");

    testContext.storageService.actionLog.append = originalAppend;

    expect(appended).toHaveLength(1);
    expect(appended[0]!.type).toBe("command:error");
    expect(appended[0]!.correlationId).toBe("test-correlation");
    expect(appended[0]!.payload).toMatchObject({
      commandId: "fragment:update",
      technicalMessage: "mutation failed",
    });
  });

  it("swallows log append failures and still returns the result", async () => {
    const context = await testContext.storageService.resolveProject(project.projectUUID);
    const logger = makeLogger();

    // Override actionLog.append to throw
    const originalAppend = testContext.storageService.actionLog.append;
    let appendCalled = false;
    testContext.storageService.actionLog.append = async () => {
      appendCalled = true;
      throw new Error("disk full");
    };

    const command: Command<string, string> = {
      async execute(_ctx, input) {
        return {
          result: input,
          logEntries: [
            {
              type: "fragment:created" as const,
              actor: "user" as const,
              target: { type: "fragment" as const, uuid: "uuid", key: "key" },
              payload: {},
              undoable: false,
            },
          ],
        };
      },
    };

    const commandContext: CommandContext = {
      storageService: testContext.storageService,
      projectContext: context,
      actor: "user",
      logger,
      correlationId: "test-correlation",
    };

    const result = await executeCommand(command, "fragment:update", commandContext, "value");
    expect(result).toBe("value");
    expect(appendCalled).toBe(true);
    expect(logger.errors.length).toBeGreaterThan(0);

    testContext.storageService.actionLog.append = originalAppend;
  });
});
