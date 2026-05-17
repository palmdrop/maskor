import type { FsEntry } from "@api/generated/maskorAPI.schemas";

export type FolderKind = "maskor-project" | "obsidian-vault" | "writing-folder" | "empty" | "other";

export const FOLDER_KIND_LABELS: Record<FolderKind, string> = {
  "maskor-project": "Maskor project",
  "obsidian-vault": "Obsidian vault",
  "writing-folder": "Writing folder",
  empty: "Empty folder",
  other: "Other",
};

const isMarkdown = (name: string) => name.endsWith(".md") || name.endsWith(".markdown");

export const detectFolderKind = (entries: FsEntry[]): FolderKind => {
  if (entries.some((entry) => entry.name === ".maskor" && entry.kind === "directory")) {
    return "maskor-project";
  }
  if (entries.some((entry) => entry.name === ".obsidian" && entry.kind === "directory")) {
    return "obsidian-vault";
  }
  if (entries.length === 0) return "empty";
  if (entries.some((entry) => entry.kind === "file" && isMarkdown(entry.name))) {
    return "writing-folder";
  }
  return "other";
};

export const countNonMarkdownFiles = (entries: FsEntry[]): number =>
  entries.filter((entry) => entry.kind === "file" && !isMarkdown(entry.name)).length;
