import type { Fragment } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { inlineFieldsToAspects, aspectsToInlineFields } from "./aspect";
import { basename } from "node:path";

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
    notes: (frontmatter.notes as string[]) ?? [],
    references: (frontmatter.references as string[]) ?? [],
    aspects: inlineFieldsToAspects(parsed.inlineFields),
    content: parsed.body,
    contentHash: "",
    updatedAt,
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
      uuid: fragment.uuid,
      updatedAt: fragment.updatedAt.toISOString(),
      readiness: fragment.readiness,
      notes: fragment.notes,
      references: fragment.references,
    },
    inlineFields: aspectsToInlineFields(fragment.aspects),
    body: fragment.content,
  };
};
