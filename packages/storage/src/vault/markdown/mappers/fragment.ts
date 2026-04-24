import type { Fragment } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { inlineFieldsToProperties, propertiesToInlineFields } from "./aspect";
import { basename } from "node:path";

const deriveTitle = (frontmatter: Record<string, unknown>, filePath: string): string => {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim() !== "") {
    return frontmatter.title.trim();
  }

  const filename = basename(filePath);
  return filename.replace(/\.md$/, "");
};

export const fromFile = (parsed: ParsedFile, filePath: string): Fragment => {
  const frontmatter = parsed.frontmatter;

  const title = deriveTitle(frontmatter, filePath);
  const isDiscarded = filePath.startsWith("discarded/");
  const updatedAtRaw = frontmatter.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string" && updatedAtRaw ? new Date(updatedAtRaw) : new Date();

  return {
    uuid: frontmatter.uuid as string,
    title,
    isDiscarded,
    readyStatus: typeof frontmatter.readyStatus === "number" ? frontmatter.readyStatus : 0,
    notes: (frontmatter.notes as string[]) ?? [],
    references: (frontmatter.references as string[]) ?? [],
    properties: inlineFieldsToProperties(parsed.inlineFields),
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
      title: fragment.title,
      updatedAt: fragment.updatedAt.toISOString(),
      readyStatus: fragment.readyStatus,
      notes: fragment.notes,
      references: fragment.references,
    },
    inlineFields: propertiesToInlineFields(fragment.properties),
    body: fragment.content,
  };
};
