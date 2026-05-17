export const deriveSlug = (name: string): string => {
  const asciiOnly = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const lowered = asciiOnly.toLowerCase();
  const hyphenated = lowered.replace(/[^a-z0-9]+/g, "-");
  const trimmed = hyphenated.replace(/^-+|-+$/g, "");
  return trimmed || "project";
};

export const resolveSlug = (baseSlug: string, existingNames: Set<string>): string => {
  if (!existingNames.has(baseSlug)) return baseSlug;
  let suffix = 2;
  while (existingNames.has(`${baseSlug}-${suffix}`)) {
    suffix++;
  }
  return `${baseSlug}-${suffix}`;
};
