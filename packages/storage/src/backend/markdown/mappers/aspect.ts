import type { Aspect, AspectUUID, FragmentProperties } from "@maskor/shared";
import type { ParsedFile } from "../parse";

// --- Aspect file mapper ---

export const fromFile = (parsed: ParsedFile): Aspect => {
  const frontmatter = parsed.frontmatter;
  const description = parsed.body?.trim() || undefined;

  return {
    uuid: frontmatter.uuid as AspectUUID,
    key: (frontmatter.key as string) ?? "",
    category: frontmatter.category as string | undefined,
    description,
    notes: (frontmatter.notes as string[]) ?? [],
  };
};

export const toFile = (aspect: Aspect): { frontmatter: Record<string, unknown>; body: string } => {
  const frontmatter: Record<string, unknown> = {
    uuid: aspect.uuid,
    key: aspect.key,
    notes: aspect.notes,
  };

  if (aspect.category !== undefined) frontmatter.category = aspect.category;

  return {
    frontmatter,
    body: aspect.description ?? "",
  };
};

// --- Inline field helpers for FragmentProperties ---

export const inlineFieldsToProperties = (fields: Record<string, string>): FragmentProperties =>
  Object.entries(fields).reduce((acc, [key, value]) => {
    const weight = parseFloat(value);
    if (!isNaN(weight)) {
      acc[key] = { weight };
    }
    return acc;
  }, {} as FragmentProperties);

export const propertiesToInlineFields = (properties: FragmentProperties): Record<string, number> =>
  Object.entries(properties).reduce(
    (acc, [key, value]) => {
      if (value === undefined) return acc;
      acc[key] = value.weight;
      return acc;
    },
    {} as Record<string, number>,
  );
