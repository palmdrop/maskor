import type { Fragment } from "@maskor/shared";
import type { Logger } from "@maskor/shared/logger";
import type { ParsedFile } from "./parse";
import { serializeFile } from "./serialize";
import * as fragmentMapper from "./mappers/fragment";
import { stat } from "node:fs/promises";

// Filesystem birthtime of a file, or undefined if it cannot be read. Used as the createdAt bootstrap
// for a freshly-adopted fragment whose frontmatter carries no createdAt yet.
const readBirthtime = async (absolutePath: string): Promise<Date | undefined> => {
  try {
    return (await stat(absolutePath)).birthtime;
  } catch {
    return undefined;
  }
};

// Adoption / canonicalization helpers shared by the watcher (incremental, per-file sync) and the
// indexer rebuild (bulk scan). When a vault file is first detected without Maskor metadata, these
// mint a UUID and write canonical frontmatter back to disk so the file becomes a first-class
// entity. They live in the markdown layer so both the watcher and the indexer can import them
// without an indexer → watcher dependency.

export type EnsureUuidResult = {
  uuid: string;
  rawContent: string;
  wasAssigned: boolean;
};

// Returns the existing UUID untouched, or mints one and writes it back to frontmatter. Generic
// across all entity types — keyed entities (aspect/note/reference) need nothing more than this, as
// their read-time mappers default every other field.
//
// `writeBack: false` mints the UUID into `parsed.frontmatter` in memory but skips the disk write.
// Fragment adoption uses this: it follows up with a full canonical write via
// writeBackFragmentFrontmatter, so serializing UUID-only frontmatter here would be an immediately
// overwritten wasted write. In that case the returned `rawContent` is the unchanged original — the
// caller takes its canonical raw content from the follow-up writeback.
export const ensureUuid = async (
  parsed: ParsedFile,
  absolutePath: string,
  rawContent: string,
  log: Logger,
  label: string,
  { writeBack = true }: { writeBack?: boolean } = {},
): Promise<EnsureUuidResult> => {
  const existing = parsed.frontmatter.uuid as string | undefined;
  if (existing) {
    return { uuid: existing, rawContent, wasAssigned: false };
  }

  const uuid = crypto.randomUUID();
  parsed.frontmatter.uuid = uuid;

  if (!writeBack) {
    return { uuid, rawContent, wasAssigned: true };
  }

  const rewritten = serializeFile({
    frontmatter: parsed.frontmatter,
    inlineFields: parsed.inlineFields,
    body: parsed.body,
  });
  await Bun.write(absolutePath, rewritten);
  log.debug({ filePath: absolutePath, uuid }, `UUID written back to ${label}`);
  return { uuid, rawContent: rewritten, wasAssigned: true };
};

// Forces a fresh UUID onto the file, overwriting any existing one. Used to resolve a UUID collision
// (two files claiming the same UUID).
export const assignNewUuid = async (
  parsed: ParsedFile,
  absolutePath: string,
  log: Logger,
  label: string,
): Promise<{ uuid: string; rawContent: string }> => {
  const uuid = crypto.randomUUID();
  parsed.frontmatter.uuid = uuid;
  const rewritten = serializeFile({
    frontmatter: parsed.frontmatter,
    inlineFields: parsed.inlineFields,
    body: parsed.body,
  });
  await Bun.write(absolutePath, rewritten);
  log.debug({ filePath: absolutePath, uuid }, `new UUID assigned to ${label}`);
  return { uuid, rawContent: rewritten };
};

// Writes complete canonical fragment frontmatter (uuid, updatedAt, readiness, notes, references)
// back to disk for a freshly-adopted fragment, preserving any fields the user already supplied via
// the read-time defaults in fragmentMapper.fromFile. The UUID must already be present in
// `parsed.frontmatter` (assigned by ensureUuid). Returns the derived fragment alongside the
// rewritten raw content so callers reuse the exact same entity for the DB upsert — calling
// fromFile again would mint a fresh `new Date()` updatedAt and drift apart from what was serialized
// to disk.
//
// The file's birthtime is used as the createdAt bootstrap: an externally-authored file (e.g. from
// Obsidian) carries no createdAt frontmatter, so its filesystem creation time is the best available
// origin. fromFile's chain still prefers an explicit frontmatter.createdAt if one is present.
export const writeBackFragmentFrontmatter = async (
  parsed: ParsedFile,
  absolutePath: string,
  entityRelativePath: string,
): Promise<{ fragment: Fragment; rawContent: string }> => {
  const birthtime = await readBirthtime(absolutePath);
  const fragment = fragmentMapper.fromFile(parsed, entityRelativePath, birthtime);
  const { frontmatter, inlineFields, body } = fragmentMapper.toFile(fragment);
  const rawContent = serializeFile({ frontmatter, inlineFields, body });
  await Bun.write(absolutePath, rawContent);
  return { fragment, rawContent };
};
