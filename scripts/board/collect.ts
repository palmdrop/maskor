/**
 * Filesystem collection across the union of all worktrees. Per the orchestrator's
 * requirement, plans/reviews/specs are read from every worktree on disk (main is
 * itself a worktree), merged and deduped by stem, with divergence flagged.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Worktree } from "./git.ts";

export interface CollectedFile {
  stem: string;
  /** Canonical content (main's copy preferred, else first seen). */
  content: string;
  /** Worktree paths that contain this stem. */
  worktrees: string[];
  /** True when content hashes differ across worktrees. */
  diverges: boolean;
}

function hash(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

/**
 * Collect `*.md` files under `<worktree>/<relativeDir>` across all worktrees.
 * Files prefixed with `_` (templates, drafts) are skipped.
 */
export function collectAcrossWorktrees(
  worktrees: Worktree[],
  relativeDir: string,
  mainPath: string,
): CollectedFile[] {
  const byStem = new Map<string, { contents: Map<string, string>; order: string[] }>();

  for (const worktree of worktrees) {
    const directory = path.join(worktree.path, relativeDir);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory)) {
      if (!entry.endsWith(".md") || entry.startsWith("_")) continue;
      const stem = entry.slice(0, -".md".length);
      const content = readFileSync(path.join(directory, entry), "utf8");
      let record = byStem.get(stem);
      if (!record) {
        record = { contents: new Map(), order: [] };
        byStem.set(stem, record);
      }
      record.contents.set(worktree.path, content);
      record.order.push(worktree.path);
    }
  }

  const collected: CollectedFile[] = [];
  for (const [stem, record] of byStem) {
    const worktreePaths = [...record.contents.keys()];
    const hashes = new Set([...record.contents.values()].map((value) => hash(value)));
    const canonicalPath = record.contents.has(mainPath) === true ? mainPath : worktreePaths[0]!;
    collected.push({
      stem,
      content: record.contents.get(canonicalPath)!,
      worktrees: worktreePaths,
      diverges: hashes.size > 1,
    });
  }

  collected.sort((a, b) => a.stem.localeCompare(b.stem));
  return collected;
}

/** Counts unchecked `- [ ]` items in a file, or 0 if it does not exist. */
export function countUncheckedItems(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf8");
  const matches = content.match(/^\s*-\s*\[ \]/gm);
  return matches?.length ?? 0;
}

/** Counts `*.md` files in a directory (used for the tasks/ PRD inbox). */
export function countMarkdownFiles(directory: string): number {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory).filter((entry) => entry.endsWith(".md") && !entry.startsWith("_"))
    .length;
}
