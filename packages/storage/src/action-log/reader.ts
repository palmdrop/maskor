import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LogEntry } from "@maskor/shared";
import { LogEntrySchema } from "@maskor/shared";
import type { Logger } from "@maskor/shared";
import { ACTION_LOG_DIRNAME, ACTION_LOG_FILENAME } from "./constants";

export const readRecentEntries = async (
  vaultPath: string,
  limit: number,
  logger?: Logger,
): Promise<LogEntry[]> => {
  const logFilePath = join(vaultPath, ACTION_LOG_DIRNAME, ACTION_LOG_FILENAME);

  let content: string;
  try {
    content = await readFile(logFilePath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const tail = lines.slice(-limit);

  const entries: LogEntry[] = [];
  for (const line of tail) {
    try {
      const parsed = LogEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) {
        entries.push(parsed.data);
      } else {
        logger
          ?.child({ module: "action-log" })
          .warn({ line: line.slice(0, 200) }, "malformed action log entry skipped");
      }
    } catch {
      logger
        ?.child({ module: "action-log" })
        .warn({ line: line.slice(0, 200) }, "malformed action log entry skipped");
    }
  }

  return entries.reverse();
};
