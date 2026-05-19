import { mkdir, readFile, rename, unlink, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { SWAP_DIRNAME, SWAP_ENTITY_TYPES, SWAP_SUBDIR, type SwapEntityType } from "./constants";
import {
  SwapEntityTypeError,
  type SwapFile,
  type SwapListEntry,
  type SwapStorage,
  type SwapStorageConfig,
} from "./types";

const assertEntityType: (entityType: string) => asserts entityType is SwapEntityType = (
  entityType,
) => {
  if (!SWAP_ENTITY_TYPES.includes(entityType as SwapEntityType)) {
    throw new SwapEntityTypeError(entityType);
  }
};

const isNotFound = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

export const createSwapStorage = (config: SwapStorageConfig): SwapStorage => {
  const { vaultPath, logger } = config;
  const swapRoot = join(vaultPath, SWAP_DIRNAME, SWAP_SUBDIR);

  const log = logger?.child({ module: "swap" });

  const filePathFor = (entityType: SwapEntityType, entityUUID: string): string =>
    join(swapRoot, entityType, `${entityUUID}.json`);

  const dirPathFor = (entityType: SwapEntityType): string => join(swapRoot, entityType);

  return {
    async write(entityType, entityUUID, content) {
      assertEntityType(entityType);
      const savedAt = new Date().toISOString();
      const payload: SwapFile = { content, savedAt };
      await mkdir(dirPathFor(entityType), { recursive: true });
      await writeFile(filePathFor(entityType, entityUUID), JSON.stringify(payload), "utf8");
      return payload;
    },

    async read(entityType, entityUUID) {
      assertEntityType(entityType);
      const filePath = filePathFor(entityType, entityUUID);
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }

      try {
        const parsed = JSON.parse(raw) as Partial<SwapFile>;
        if (typeof parsed.content !== "string" || typeof parsed.savedAt !== "string") {
          throw new Error("Swap file missing required fields");
        }
        return { content: parsed.content, savedAt: parsed.savedAt };
      } catch (error) {
        // TODO: .corrupt files are never cleaned up. One stays per entity that
        // ever had a malformed swap; subsequent corruptions overwrite the same
        // <file>.corrupt. Low priority — corruption is rare and the file is
        // tiny — but worth a periodic sweep if it ever becomes a problem.
        const corruptPath = `${filePath}.corrupt`;
        log?.warn(
          { entityType, entityUUID, corruptPath, error: (error as Error).message },
          "swap file malformed; quarantined",
        );
        try {
          await rename(filePath, corruptPath);
        } catch (renameError) {
          log?.warn(
            { filePath, error: (renameError as Error).message },
            "failed to quarantine corrupt swap file",
          );
        }
        return null;
      }
    },

    async delete(entityType, entityUUID) {
      assertEntityType(entityType);
      try {
        await unlink(filePathFor(entityType, entityUUID));
      } catch (error) {
        if (isNotFound(error)) return;
        throw error;
      }
    },

    async list() {
      const entries: SwapListEntry[] = [];
      for (const entityType of SWAP_ENTITY_TYPES) {
        let files: string[];
        try {
          files = await readdir(dirPathFor(entityType));
        } catch (error) {
          if (isNotFound(error)) continue;
          throw error;
        }
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const entityUUID = file.slice(0, -".json".length);
          const filePath = join(dirPathFor(entityType), file);
          let raw: string;
          try {
            raw = await readFile(filePath, "utf8");
          } catch (error) {
            if (isNotFound(error)) continue;
            throw error;
          }
          try {
            const parsed = JSON.parse(raw) as Partial<SwapFile>;
            if (typeof parsed.savedAt !== "string") continue;
            entries.push({ entityType, entityUUID, savedAt: parsed.savedAt });
          } catch {
            continue;
          }
        }
      }
      return entries;
    },
  };
};
