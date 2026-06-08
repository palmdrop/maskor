import { randomUUID } from "node:crypto";
import type { Logger } from "@maskor/shared/logger";
import type { LogEntry } from "@maskor/shared";
import type { StorageService, ProjectContext } from "@maskor/storage";

export type CommandContext = {
  storageService: StorageService;
  projectContext: ProjectContext;
  actor: "user";
  logger: Logger;
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
  ctx: CommandContext,
  input: TInput,
): Promise<TOutput> => {
  const { result, logEntries } = await command.execute(ctx, input);

  for (const entry of logEntries) {
    const full: LogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      correlationId: randomUUID(),
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
