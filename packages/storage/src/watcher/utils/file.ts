import type { Logger } from "@maskor/shared";

export const readFileWithEnoentGuard = async (
  absolutePath: string,
  label: string,
  log: Logger,
): Promise<string | null> => {
  try {
    return await Bun.file(absolutePath).text();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      log.warn(
        { filePath: absolutePath },
        `watcher: file removed before read (${label}) — skipping`,
      );
      return null;
    }
    throw error;
  }
};
