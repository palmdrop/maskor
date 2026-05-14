/**
 * Rewrites relative imports in src/ to use Vite aliases defined in vite.config.ts.
 * Run from the repo root: bun run scripts/rewrite-imports.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";

const FRONTEND_SRC = path.resolve(import.meta.dir, "../packages/frontend/src");

// Order matters: more specific aliases must come before less specific ones.
const ALIASES: [alias: string, absoluteTarget: string][] = [
  ["@api", path.join(FRONTEND_SRC, "api")],
  ["@assets", path.join(FRONTEND_SRC, "assets")],
  ["@components", path.join(FRONTEND_SRC, "components")],
  ["@hooks", path.join(FRONTEND_SRC, "hooks")],
  ["@lib", path.join(FRONTEND_SRC, "lib")],
  ["@pages", path.join(FRONTEND_SRC, "pages")],
  ["@styles", path.join(FRONTEND_SRC, "styles")],
  ["@", FRONTEND_SRC],
];

const DRY_RUN = process.argv.includes("--dry-run");

const IMPORT_RE = /((?:from|import)\s+['"])(\.[^'"]+)(['"'])/g;

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveAlias(importSpecifier: string, fromFile: string): string | null {
  if (!importSpecifier.startsWith("..")) return null;
  const resolved = path.resolve(path.dirname(fromFile), importSpecifier);
  for (const [alias, target] of ALIASES) {
    if (resolved === target) {
      return alias;
    }
    if (resolved.startsWith(target + path.sep)) {
      return alias + "/" + resolved.slice(target.length + 1);
    }
  }
  return null;
}

async function rewriteFile(filePath: string): Promise<boolean> {
  const original = await readFile(filePath, "utf8");
  let changed = false;

  const rewritten = original.replace(IMPORT_RE, (match, prefix, specifier, quote) => {
    const aliased = resolveAlias(specifier, filePath);
    if (!aliased) return match;
    changed = true;
    return `${prefix}${aliased}${quote}`;
  });

  if (changed) {
    const relative = path.relative(process.cwd(), filePath);
    console.log(DRY_RUN ? `[dry-run] ${relative}` : `Updated: ${relative}`);
    if (!DRY_RUN) {
      await writeFile(filePath, rewritten, "utf8");
    }
  }

  return changed;
}

const files = await collectFiles(FRONTEND_SRC);
let updatedCount = 0;
for (const file of files) {
  if (await rewriteFile(file)) updatedCount++;
}

console.log(
  `\n${DRY_RUN ? "[dry-run] Would update" : "Updated"} ${updatedCount} / ${files.length} files.`,
);
