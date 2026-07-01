import type { Fragment, FragmentLanguageCode } from "@maskor/shared";
import { FragmentLanguageCodeSchema } from "@maskor/shared";
import type { ParsedFile } from "../parse";
import { inlineFieldsToAspects, aspectsToInlineFields } from "./aspect";
import { basename } from "node:path";

// Frontmatter keys Maskor manages directly. `notes` is intentionally included: the fragment notes
// attachment was removed (ADR 0007 / margins), so a legacy `notes:` list is dropped on the next save
// rather than preserved as user data. Every other frontmatter key is preserved verbatim.
const MANAGED_FRONTMATTER_KEYS = new Set([
  "uuid",
  "createdAt",
  "updatedAt",
  "readiness",
  "references",
  "notes",
  "lang",
]);

// The per-fragment language override lives in frontmatter as `lang` (short, Obsidian-neutral). Any value
// that is not a concrete catalog code — absent, empty, or unknown — degrades to "inherit" (undefined)
// rather than breaking the read. The empty string is intentionally not a valid override (browser default
// is project-level only), so `safeParse` rejecting `""` is the correct behaviour, not a special case.
const readFragmentLanguage = (raw: unknown): FragmentLanguageCode | undefined => {
  if (typeof raw !== "string") return undefined;
  const parsed = FragmentLanguageCodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

const extractExtraFrontmatter = (frontmatter: Record<string, unknown>): Record<string, unknown> => {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!MANAGED_FRONTMATTER_KEYS.has(key)) extra[key] = value;
  }
  return extra;
};

// `fileBirthtime` is the filesystem birthtime of the source file, consulted only when frontmatter
// carries no `createdAt` (the bootstrap case for externally-authored files being adopted). The
// resolution chain is: frontmatter.createdAt → fileBirthtime → updatedAt → now. Once a bootstrapped
// fragment is saved, `createdAt` lives in frontmatter and birthtime is never consulted again. The
// mapper itself does no IO — callers stat and pass the birthtime in (see writeBackFragmentFrontmatter).
export const fromFile = (parsed: ParsedFile, filePath: string, fileBirthtime?: Date): Fragment => {
  const frontmatter = parsed.frontmatter;

  const key = basename(filePath).replace(/\.md$/, "");
  const isDiscarded = filePath.startsWith("discarded/");
  const updatedAtRaw = frontmatter.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string" && updatedAtRaw ? new Date(updatedAtRaw) : new Date();
  const createdAtRaw = frontmatter.createdAt;
  const createdAt =
    typeof createdAtRaw === "string" && createdAtRaw
      ? new Date(createdAtRaw)
      : (fileBirthtime ?? updatedAt);

  return {
    uuid: frontmatter.uuid as string,
    key,
    isDiscarded,
    readiness: typeof frontmatter.readiness === "number" ? frontmatter.readiness : 0,
    references: (frontmatter.references as string[]) ?? [],
    aspects: inlineFieldsToAspects(parsed.inlineFields),
    language: readFragmentLanguage(frontmatter.lang),
    content: parsed.body,
    contentHash: "",
    createdAt,
    updatedAt,
    extraFrontmatter: extractExtraFrontmatter(frontmatter),
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
      // Unmanaged user keys first, so the managed keys below always win on a name clash.
      ...(fragment.extraFrontmatter ?? {}),
      uuid: fragment.uuid,
      createdAt: fragment.createdAt.toISOString(),
      updatedAt: fragment.updatedAt.toISOString(),
      readiness: fragment.readiness,
      references: fragment.references,
      // Persist the override only when set; an absent override means "inherit the project language" and
      // leaves no `lang` key behind. `language` is a concrete code or undefined (never `""`), so an
      // explicit undefined check is exact.
      ...(fragment.language !== undefined ? { lang: fragment.language } : {}),
    },
    inlineFields: aspectsToInlineFields(fragment.aspects),
    body: fragment.content,
  };
};
