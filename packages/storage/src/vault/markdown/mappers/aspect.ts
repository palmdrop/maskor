import type { Aspect, AspectWeights } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";
import { deriveCategory } from "../../../utils/category";

// --- Aspect file mapper ---

// Frontmatter keys Maskor manages directly. The managed `notes:` list is preserved on its own; every
// other (unmanaged) key is carried through read→write verbatim so a Maskor save never strips user
// data (e.g. Obsidian `tags`/`aliases`).
const MANAGED_FRONTMATTER_KEYS = new Set(["uuid", "color", "notes"]);

const extractExtraFrontmatter = (frontmatter: Record<string, unknown>): Record<string, unknown> => {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!MANAGED_FRONTMATTER_KEYS.has(key)) extra[key] = value;
  }
  return extra;
};

export const fromFile = (parsed: ParsedFile, filePath: string): Aspect => {
  const frontmatter = parsed.frontmatter;
  const description = parsed.body?.trim() || undefined;
  const key = basename(filePath).replace(/\.md$/, "");

  return {
    uuid: frontmatter.uuid as string,
    key,
    category: deriveCategory(filePath),
    color: frontmatter.color as string | undefined,
    description,
    notes: (frontmatter.notes as string[]) ?? [],
    extraFrontmatter: extractExtraFrontmatter(frontmatter),
  };
};

export const toFile = (aspect: Aspect): { frontmatter: Record<string, unknown>; body: string } => {
  const frontmatter: Record<string, unknown> = {
    // Unmanaged user keys first, so the managed keys below always win on a name clash.
    ...(aspect.extraFrontmatter ?? {}),
    uuid: aspect.uuid,
    notes: aspect.notes,
  };

  if (aspect.color !== undefined) {
    frontmatter.color = aspect.color;
  }

  return {
    frontmatter,
    body: aspect.description ?? "",
  };
};

// --- Inline field helpers for AspectWeights ---

export const inlineFieldsToAspects = (fields: Record<string, string>): AspectWeights =>
  Object.entries(fields).reduce((acc, [key, value]) => {
    const weight = parseFloat(value);
    if (!isNaN(weight)) {
      acc[key] = { weight };
    }
    return acc;
  }, {} as AspectWeights);

export const aspectsToInlineFields = (aspects: AspectWeights): Record<string, number> =>
  Object.entries(aspects).reduce(
    (acc, [key, value]) => {
      if (value === undefined) return acc;
      acc[key] = value.weight;
      return acc;
    },
    {} as Record<string, number>,
  );
