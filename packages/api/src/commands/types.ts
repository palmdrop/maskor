import { randomUUID } from "node:crypto";
import type { Logger } from "@maskor/shared/logger";
import type { LogEntry } from "@maskor/shared";
import type { StorageService, ProjectContext } from "@maskor/storage";

export type CommandContext = {
  storageService: StorageService;
  projectContext: ProjectContext;
  actor: "user";
  logger: Logger;
  correlationId: string;
};

export type Command<TInput, TOutput> = {
  execute(
    ctx: CommandContext,
    input: TInput,
  ): Promise<{
    result: TOutput;
    logEntries: Omit<LogEntry, "id" | "timestamp" | "correlationId">[];
  }>;
};

export const executeCommand = async <TInput, TOutput>(
  command: Command<TInput, TOutput>,
  // Canonical backend domain label (e.g. "fragment:update"). Recorded on the
  // command:error entry if execution throws. Passed at the call site rather than
  // stored on the Command, so command definitions and their tests stay untouched.
  commandId: string,
  ctx: CommandContext,
  input: TInput,
): Promise<TOutput> => {
  let result: TOutput;
  let logEntries: Omit<LogEntry, "id" | "timestamp" | "correlationId">[];
  try {
    ({ result, logEntries } = await command.execute(ctx, input));
  } catch (error) {
    // Record the failure (mutation-level — `commandId` is the backend domain
    // label) then re-throw the original error unchanged. Best-effort append,
    // same pattern as success entries below.
    const failureEntry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      correlationId: ctx.correlationId,
      type: "command:error",
      actor: "system",
      undoable: false,
      payload: {
        commandId,
        technicalMessage: error instanceof Error ? error.message : String(error),
      },
    };
    try {
      await ctx.storageService.actionLog.append(ctx.projectContext, failureEntry);
    } catch (appendError) {
      ctx.logger.error(
        { error: appendError, entry: failureEntry },
        "command:error log append failed",
      );
    }
    throw error;
  }

  for (const entry of logEntries) {
    const full: LogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      correlationId: ctx.correlationId,
    } as LogEntry;

    try {
      await ctx.storageService.actionLog.append(ctx.projectContext, full);
    } catch (error) {
      ctx.logger.error({ error, entry: full }, "action log append failed");
    }
  }

  return result;
};

// Global commands run outside a project context (e.g. project lifecycle operations).
// They do not emit action log entries.
export type GlobalCommandContext = {
  storageService: StorageService;
  actor: "user";
  logger: Logger;
};

export type GlobalCommand<TInput, TOutput> = {
  execute(ctx: GlobalCommandContext, input: TInput): Promise<TOutput>;
};

export const executeGlobalCommand = async <TInput, TOutput>(
  command: GlobalCommand<TInput, TOutput>,
  ctx: GlobalCommandContext,
  input: TInput,
): Promise<TOutput> => {
  return command.execute(ctx, input);
};
