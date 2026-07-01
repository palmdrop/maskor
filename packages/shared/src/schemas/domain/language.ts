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

// A concrete writing language — the catalog minus the empty-string "browser default" sentinel. This is
// the shape of a per-fragment override: a fragment either inherits (no override) or names a real
// language. "Browser default" is a project-level concept only (see `FragmentLanguageSchema`).
export type FragmentLanguageCode = Exclude<LanguageCode, typeof LANGUAGE_INHERIT>;

const LANGUAGE_CODES = LANGUAGE_CATALOG.map((entry) => entry.code) as [
  LanguageCode,
  ...LanguageCode[],
];

const FRAGMENT_LANGUAGE_CODES = LANGUAGE_CATALOG.map((entry) => entry.code).filter(
  (code): code is FragmentLanguageCode => code !== LANGUAGE_INHERIT,
) as [FragmentLanguageCode, ...FragmentLanguageCode[]];

// Project-level writing language. The empty-string sentinel (browser default) is a valid value, so the
// project always carries a concrete `editor.language` string.
export const LanguageCodeSchema = z.enum(LANGUAGE_CODES);

// A concrete fragment-override language (excludes the empty-string "browser default").
export const FragmentLanguageCodeSchema = z.enum(FRAGMENT_LANGUAGE_CODES);

// Per-fragment override. `undefined`/absent means "inherit the project language"; a concrete code
// overrides it. The empty-string "browser default" is NOT a valid fragment override — that sentinel is
// project-level only, and a fragment expresses "no language preference" by simply not overriding.
export const FragmentLanguageSchema = FragmentLanguageCodeSchema.optional();

// The non-empty placeholder value both language dropdowns hand to Radix `Select` in place of a "special"
// choice (Radix rejects an empty-string `SelectItem` value). Each dropdown maps it back to its own
// meaning: the project Select → `""` (browser default); the fragment Select → `null` (clear override).
// A single shared constant keeps the two dropdowns from silently diverging.
export const LANGUAGE_SELECT_EMPTY_VALUE = "__language_none__" as const;

// Resolve the language the editor should apply to a fragment: the fragment override wins when present,
// otherwise the project language. Returns a BCP-47 code, or the empty-string sentinel for "no explicit
// language" (the editor then omits the `lang` attribute and defers to the browser/OS default).
export const resolveLanguage = (
  fragmentLanguage: LanguageCode | undefined,
  projectLanguage: LanguageCode,
): LanguageCode => fragmentLanguage ?? projectLanguage;
