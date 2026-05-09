import { mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { LogEntry } from "@maskor/shared";
import type { ActionLogConfig, ActionLogWriter } from "./types";
import {
  ACTION_LOG_DIRNAME,
  ACTION_LOG_FILENAME,
  DEFAULT_ROTATION_THRESHOLD,
} from "./constants";

const countLines = async (filePath: string): Promise<number> => {
  try {
    const content = await readFile(filePath, "utf8");
    if (!content.trim()) return 0;
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
};

export const createActionLogWriter = async (
  config: ActionLogConfig,
): Promise<ActionLogWriter> => {
  const { vaultPath, logger, rotationThreshold = DEFAULT_ROTATION_THRESHOLD } = config;
  const maskorDir = join(vaultPath, ACTION_LOG_DIRNAME);
  const logFilePath = join(maskorDir, ACTION_LOG_FILENAME);

  await mkdir(maskorDir, { recursive: true });
  await appendFile(logFilePath, "", "utf8");

  let lineCount = await countLines(logFilePath);

  const rotate = async (): Promise<void> => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveName = `action-log.${timestamp}.jsonl`;
    const archivePath = join(maskorDir, archiveName);
    await rename(logFilePath, archivePath);
    await writeFile(logFilePath, "", "utf8");
    lineCount = 0;
    logger?.child({ module: "action-log" }).info({ archivePath }, "action log rotated");
  };

  const append = async (entry: LogEntry): Promise<void> => {
    const entryWithDefaults: LogEntry = {
      ...entry,
      id: entry.id || randomUUID(),
      timestamp: entry.timestamp || new Date().toISOString(),
    } as LogEntry;

    const line = JSON.stringify(entryWithDefaults) + "\n";
    await appendFile(logFilePath, line, "utf8");
    lineCount++;

    if (lineCount >= rotationThreshold) {
      await rotate();
    }
  };

  return { append, rotate };
};
