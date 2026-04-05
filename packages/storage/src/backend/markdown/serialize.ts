import matter from "gray-matter";

type SerializeOptions = {
  frontmatter: Record<string, unknown>;
  inlineFields?: Record<string, string | number>;
  body: string;
};

export const serializeFile = ({ frontmatter, inlineFields, body }: SerializeOptions): string => {
  const frontmatterString = matter.stringify("", frontmatter).trimEnd();

  const inlineSection =
    inlineFields && !!Object.keys(inlineFields).length
      ? Object.entries(inlineFields)
          .map(([key, value]) => `${key}:: ${value}`)
          .join("\n")
      : null;

  const parts = [frontmatterString];
  if (inlineSection) parts.push(inlineSection);
  if (body.trim()) parts.push(body.trim());

  return parts.join("\n\n") + "\n";
};
