import { join } from "node:path";
import { stat } from "node:fs/promises";

export const deriveSlug = (name: string): string => {
  const asciiOnly = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lowered = asciiOnly.toLowerCase();
  const hyphenated = lowered.replace(/[^a-z0-9]+/g, "-");
  const trimmed = hyphenated.replace(/^-+|-+$/g, "");
  return trimmed || "project";
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

export const resolveSlugOnDisk = async (slug: string, managedRoot: string): Promise<string> => {
  if (!(await pathExists(join(managedRoot, slug)))) return slug;
  let suffix = 2;
  while (await pathExists(join(managedRoot, `${slug}-${suffix}`))) {
    suffix++;
  }
  return `${slug}-${suffix}`;
};
