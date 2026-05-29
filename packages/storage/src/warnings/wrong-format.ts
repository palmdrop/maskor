import { readdirSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import type { SyncWarning } from "../indexer/types";

// Top-level entity folders scanned for wrong-format files. Mirrors the watcher routing table
// (fragments / aspects / notes / references); sequences are not file-dropped by users.
const ENTITY_FOLDERS = ["fragments", "aspects", "notes", "references"] as const;

const isIgnored = (name: string): boolean => name.startsWith(".");

const collectNonMarkdownFiles = (
  directory: string,
  vaultRoot: string,
  accumulator: string[],
): void => {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return; // folder absent — nothing to scan
  }

  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectNonMarkdownFiles(absolutePath, vaultRoot, accumulator);
    } else if (entry.isFile() && !entry.name.endsWith(".md")) {
      accumulator.push(relative(vaultRoot, absolutePath).split(sep).join("/"));
    }
  }
};

// Scan all entity folders for non-`.md`, non-dotfile files. Each becomes a WRONG_FORMAT_FILE
// warning keyed by its vault-root-relative path. Conversion stays in the import pipeline — these
// files are never auto-converted, only surfaced to the user.
export const detectWrongFormatFiles = (vaultRoot: string): SyncWarning[] => {
  const filePaths: string[] = [];
  for (const folder of ENTITY_FOLDERS) {
    collectNonMarkdownFiles(join(vaultRoot, folder), vaultRoot, filePaths);
  }
  return filePaths.map((filePath) => ({ kind: "WRONG_FORMAT_FILE", filePath }));
};
