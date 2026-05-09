import type { Logger } from "@maskor/shared";
import type { LogEntry } from "@maskor/shared";

export type ActionLogConfig = {
  vaultPath: string;
  logger?: Logger;
  rotationThreshold?: number;
};

export type ActionLogWriter = {
  append(entry: LogEntry): Promise<void>;
  rotate(): Promise<void>;
};

export type ActionLogReader = {
  readRecent(limit: number): Promise<LogEntry[]>;
};
