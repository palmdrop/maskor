import type { Logger } from "@maskor/shared";
import type { ParsedFile } from "../../vault/markdown/parse";
import { serializeFile } from "../../vault/markdown/serialize";

export type EnsureUuidResult = {
  uuid: string;
  rawContent: string;
  wasAssigned: boolean;
};

export const ensureUuid = async (
  parsed: ParsedFile,
  absolutePath: string,
  rawContent: string,
  log: Logger,
  label: string,
): Promise<EnsureUuidResult> => {
  const existing = parsed.frontmatter.uuid as string | undefined;
  if (existing) {
    return { uuid: existing, rawContent, wasAssigned: false };
  }

  const uuid = crypto.randomUUID();
  parsed.frontmatter.uuid = uuid;
  const rewritten = serializeFile({
    frontmatter: parsed.frontmatter,
    inlineFields: parsed.inlineFields,
    body: parsed.body,
  });
  await Bun.write(absolutePath, rewritten);
  log.debug({ filePath: absolutePath, uuid }, `watcher: UUID written back to ${label}`);
  return { uuid, rawContent: rewritten, wasAssigned: true };
};

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
  log.debug({ filePath: absolutePath, uuid }, `watcher: new UUID assigned to ${label}`);
  return { uuid, rawContent: rewritten };
};
