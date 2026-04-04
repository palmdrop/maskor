import pino from "pino";
import type { Logger } from "pino";
import { createStream } from "rotating-file-stream";
import { mkdirSync } from "node:fs";

export type { Logger };

export type LoggerConfig = {
  service: string;
  logDir?: string;
  level?: string;
};

export const createLogger = ({ service, logDir, level = "info" }: LoggerConfig): pino.Logger => {
  const streams: pino.StreamEntry[] = [{ stream: process.stdout }];

  if (logDir) {
    mkdirSync(logDir, { recursive: true });
    const fileStream = createStream("maskor.log", {
      path: logDir,
      interval: "1d",
      maxFiles: 14,
    });
    streams.push({ stream: fileStream });
  }

  return pino({ level, base: { service } }, pino.multistream(streams));
};
