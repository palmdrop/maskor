import type { Aspect, AspectUUID, FragmentProperties } from "@maskor/shared";
import type { ParsedFile } from "../parse";

// --- Aspect file mapper ---

export const fromFile = (parsed: ParsedFile): Aspect => {
  const frontmatter = parsed.frontmatter;
  const description = parsed.body?.trim() || undefined;

  return {
    uuid: frontmatter.uuid as string as AspectUUID,
    key: (frontmatter.key as string) ?? "",
    category: (frontmatter.category as string | undefined) ?? undefined,
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

export const inlineFieldsToProperties = (fields: Record<string, string>): FragmentProperties => {
  const properties: FragmentProperties = {};
  for (const [key, value] of Object.entries(fields)) {
    const weight = parseFloat(value);
    if (!isNaN(weight)) {
      properties[key] = { weight };
    }
  }
  return properties;
};

export const propertiesToInlineFields = (
  properties: FragmentProperties,
): Record<string, number> => {
  const fields: Record<string, number> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) fields[key] = value.weight;
  }
  return fields;
};
