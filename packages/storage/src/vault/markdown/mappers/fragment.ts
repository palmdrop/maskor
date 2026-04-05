import type { Fragment, FragmentUUID, Pool } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { inlineFieldsToProperties, propertiesToInlineFields } from "./aspect";
import { basename } from "node:path";

const hasRequiredFields = (frontmatter: Record<string, unknown>): boolean => {
  return (
    typeof frontmatter.title === "string" &&
    frontmatter.title.trim() !== "" &&
    typeof frontmatter.readyStatus === "number"
  );
};

const deriveTitle = (frontmatter: Record<string, unknown>, filePath: string): string => {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim() !== "") {
    return frontmatter.title.trim();
  }

  const filename = basename(filePath);
  return filename.replace(/\.md$/, "");
};

const derivePool = (frontmatter: Record<string, unknown>, poolOverride?: Pool): Pool => {
  if (poolOverride) return poolOverride;

  if (frontmatter.pool === "unprocessed") return "unprocessed";
  if (frontmatter.pool === "incomplete") return "incomplete";
  if (frontmatter.pool === "unplaced") return "unplaced";
  if (frontmatter.pool === "discarded") return "discarded";

  return hasRequiredFields(frontmatter) ? "unplaced" : "incomplete";
};

export const fromFile = (parsed: ParsedFile, filePath: string, poolOverride?: Pool): Fragment => {
  const frontmatter = parsed.frontmatter;

  const title = deriveTitle(frontmatter, filePath);
  const pool = derivePool(frontmatter, poolOverride);

  return {
    uuid: frontmatter.uuid as FragmentUUID,
    title,
    version: typeof frontmatter.version === "number" ? frontmatter.version : 1,
    pool,
    readyStatus: typeof frontmatter.readyStatus === "number" ? frontmatter.readyStatus : 0,
    notes: (frontmatter.notes as string[]) ?? [],
    references: (frontmatter.references as string[]) ?? [],
    properties: inlineFieldsToProperties(parsed.inlineFields),
    content: parsed.body,
    // DB-only fields — set to placeholder values at this layer
    contentHash: "",
    updatedAt: new Date(0),
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
      version: fragment.version,
      pool: fragment.pool,
      readyStatus: fragment.readyStatus,
      notes: fragment.notes,
      references: fragment.references,
    },
    inlineFields: propertiesToInlineFields(fragment.properties),
    body: fragment.content,
  };
};
