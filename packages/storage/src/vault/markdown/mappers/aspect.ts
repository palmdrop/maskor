import type { Aspect, AspectWeights } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { basename } from "node:path";
import { deriveCategory } from "../../../utils/category";

// --- Aspect file mapper ---

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
  };
};

export const toFile = (aspect: Aspect): { frontmatter: Record<string, unknown>; body: string } => {
  const frontmatter: Record<string, unknown> = {
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
