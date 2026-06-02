import type { Fragment } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { inlineFieldsToAspects, aspectsToInlineFields } from "./aspect";
import { basename } from "node:path";

// Frontmatter keys Maskor manages directly. `notes` is intentionally included: the fragment notes
// attachment was removed (ADR 0007 / margins), so a legacy `notes:` list is dropped on the next save
// rather than preserved as user data. Every other frontmatter key is preserved verbatim.
const MANAGED_FRONTMATTER_KEYS = new Set(["uuid", "updatedAt", "readiness", "references", "notes"]);

const extractExtraFrontmatter = (frontmatter: Record<string, unknown>): Record<string, unknown> => {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!MANAGED_FRONTMATTER_KEYS.has(key)) extra[key] = value;
  }
  return extra;
};

export const fromFile = (parsed: ParsedFile, filePath: string): Fragment => {
  const frontmatter = parsed.frontmatter;

  const key = basename(filePath).replace(/\.md$/, "");
  const isDiscarded = filePath.startsWith("discarded/");
  const updatedAtRaw = frontmatter.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string" && updatedAtRaw ? new Date(updatedAtRaw) : new Date();

  return {
    uuid: frontmatter.uuid as string,
    key,
    isDiscarded,
    readiness: typeof frontmatter.readiness === "number" ? frontmatter.readiness : 0,
    references: (frontmatter.references as string[]) ?? [],
    aspects: inlineFieldsToAspects(parsed.inlineFields),
    content: parsed.body,
    contentHash: "",
    updatedAt,
    extraFrontmatter: extractExtraFrontmatter(frontmatter),
  };
};

export const toFile = (
  fragment: Fragment,
): {
  frontmatter: Record<string, unknown>;
  inlineFields: Record<string, number>;
  body: string;
} => {
  return {
    frontmatter: {
      // Unmanaged user keys first, so the managed keys below always win on a name clash.
      ...(fragment.extraFrontmatter ?? {}),
      uuid: fragment.uuid,
      updatedAt: fragment.updatedAt.toISOString(),
      readiness: fragment.readiness,
      references: fragment.references,
    },
    inlineFields: aspectsToInlineFields(fragment.aspects),
    body: fragment.content,
  };
};
