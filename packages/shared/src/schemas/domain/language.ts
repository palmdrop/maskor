import { z } from "zod";

// Curated set of writing languages Maskor offers. The code is a BCP-47 tag handed to the browser's
// native spell-checker via the editor's `lang` attribute; the dictionary itself is provided by the
// OS/browser, so this list is intentionally short and can grow on demand. The empty-string sentinel
// means "no explicit language" — the editor falls back to the browser/OS default.
//
// Single source of truth: the project config dropdown, the per-fragment override dropdown, and the
// schemas below all derive from this list.
export const LANGUAGE_INHERIT = "" as const;

export const LANGUAGE_CATALOG = [
  { code: LANGUAGE_INHERIT, label: "Browser default" },
  { code: "sv", label: "Swedish" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
] as const;

export type LanguageCode = (typeof LANGUAGE_CATALOG)[number]["code"];

const LANGUAGE_CODES = LANGUAGE_CATALOG.map((entry) => entry.code) as [
  LanguageCode,
  ...LanguageCode[],
];

// Project-level writing language. The empty-string sentinel (browser default) is a valid value, so the
// project always carries a concrete `editor.language` string.
export const LanguageCodeSchema = z.enum(LANGUAGE_CODES);

// Per-fragment override. `undefined`/absent means "inherit the project language"; a concrete code
// (including the empty-string "browser default") overrides it. The empty string is therefore a
// meaningful override distinct from absence — a fragment can opt out of the project language.
export const FragmentLanguageSchema = LanguageCodeSchema.optional();

// Resolve the language the editor should apply to a fragment: the fragment override wins when present,
// otherwise the project language. Returns a BCP-47 code, or the empty-string sentinel for "no explicit
// language" (the editor then omits the `lang` attribute and defers to the browser/OS default).
export const resolveLanguage = (
  fragmentLanguage: LanguageCode | undefined,
  projectLanguage: LanguageCode,
): LanguageCode => fragmentLanguage ?? projectLanguage;
