// Obsidian-style document links: `[[type/key]]` and `[[type/key|display alias]]`. Unlike the comment
// anchor marker, a link is user-visible prose content — it stays in the editor buffer and round-trips
// through Obsidian verbatim. These helpers are shared by storage (link-table sync, rename cascade) and
// both editors (rendering, autocomplete) — keep them browser-safe (no Node built-ins).
//
// Naming: a link's *path type* is the plural vault-folder segment the user writes (`notes`,
// `fragments`, …), matching Obsidian. The DB / API entity kind is the singular form (`note`,
// `fragment`, …) used everywhere else in the codebase. `linkPathTypeToEntityKind` bridges the two.

import { ENTITY_KEY_CHAR_CLASS } from "./validate-entity-key";

// The link path types accepted inside `[[type/key]]`, in the plural vault-folder form. A `[[type/…]]`
// whose type is not one of these is not treated as a link (renders as plain text; never indexed).
export const LINK_PATH_TYPES = ["fragments", "notes", "references", "aspects"] as const;

export type LinkPathType = (typeof LINK_PATH_TYPES)[number];

// Singular DB / API entity kind for each plural link path type.
export type LinkEntityKind = "fragment" | "note" | "reference" | "aspect";

const LINK_PATH_TYPE_TO_ENTITY_KIND: Record<LinkPathType, LinkEntityKind> = {
  fragments: "fragment",
  notes: "note",
  references: "reference",
  aspects: "aspect",
};

const ENTITY_KIND_TO_LINK_PATH_TYPE: Record<LinkEntityKind, LinkPathType> = {
  fragment: "fragments",
  note: "notes",
  reference: "references",
  aspect: "aspects",
};

export const linkPathTypeToEntityKind = (pathType: LinkPathType): LinkEntityKind =>
  LINK_PATH_TYPE_TO_ENTITY_KIND[pathType];

export const entityKindToLinkPathType = (kind: LinkEntityKind): LinkPathType =>
  ENTITY_KIND_TO_LINK_PATH_TYPE[kind];

const isLinkPathType = (value: string): value is LinkPathType =>
  (LINK_PATH_TYPES as readonly string[]).includes(value);

// A link parsed out of a body.
//   - `targetType` is the plural path type, or `null` for a bare `[[key]]` link (resolved later by
//     Obsidian's shortest-path rule — the type is unknown until the vault is consulted).
//   - `targetKey` is the entity key with any `.md` suffix stripped.
//   - `alias` is the display text after `|`, or `null`.
//   - `raw` is the full `[[…]]` source; `index` its offset in the body.
export type ParsedDocumentLink = {
  targetType: LinkPathType | null;
  targetKey: string;
  alias: string | null;
  raw: string;
  index: number;
};

// Matches `[[target]]` and `[[target|alias]]`. The target captures everything that is not a bracket,
// newline, or the `|` alias separator; the alias captures everything up to the closing `]]`. A target
// containing an unknown type prefix is filtered out in `parseDocumentLinks` (it is not a link).
const DOCUMENT_LINK_REGEX = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g;

const stripMdSuffix = (value: string): string => value.replace(/\.md$/i, "");

// Split a link target into its path type and key. A `type/key` target with a known type yields that
// type; a `type/key` target with an *unknown* type returns `undefined` (not a link). A target with no
// `/` is a bare name (type `null`, resolved later).
const splitTarget = (
  target: string,
): { targetType: LinkPathType | null; targetKey: string } | undefined => {
  const trimmed = target.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex === -1) {
    return { targetType: null, targetKey: stripMdSuffix(trimmed) };
  }
  const typeSegment = trimmed.slice(0, slashIndex);
  const keySegment = trimmed.slice(slashIndex + 1);
  if (!isLinkPathType(typeSegment)) return undefined;
  return { targetType: typeSegment, targetKey: stripMdSuffix(keySegment.trim()) };
};

// Every document link in `body`, in document order. Links with an unrecognised type prefix
// (`[[gibberish/foo]]`) are skipped — they are plain text, never indexed.
export const parseDocumentLinks = (body: string): ParsedDocumentLink[] => {
  const links: ParsedDocumentLink[] = [];
  for (const match of body.matchAll(DOCUMENT_LINK_REGEX)) {
    const target = match[1];
    if (target === undefined) continue;
    const split = splitTarget(target);
    if (!split) continue;
    if (split.targetKey.length === 0) continue;
    const aliasRaw = match[2];
    const alias = aliasRaw !== undefined && aliasRaw.trim().length > 0 ? aliasRaw.trim() : null;
    links.push({
      targetType: split.targetType,
      targetKey: split.targetKey,
      alias,
      raw: match[0],
      index: match.index,
    });
  }
  return links;
};

// The canonical full-path link Maskor always inserts: `[[type/key]]` or `[[type/key|alias]]`.
export const buildDocumentLink = (
  pathType: LinkPathType,
  key: string,
  alias?: string | null,
): string => (alias ? `[[${pathType}/${key}|${alias}]]` : `[[${pathType}/${key}]]`);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Rewrite every full-path link to `type/oldKey` so it points at `newKey`, preserving any alias. Used
// by the rename cascade. Canonical (full-path) form only — Maskor-authored links are full-path; a bare
// `[[oldKey]]` is left untouched (its type is ambiguous, and rewriting it risks corrupting an
// unrelated entity's link). Returns the rewritten body (unchanged if nothing matched).
export const rewriteDocumentLinks = (
  body: string,
  pathType: LinkPathType,
  oldKey: string,
  newKey: string,
): string => {
  const pattern = new RegExp(
    `\\[\\[${escapeRegExp(pathType)}/${escapeRegExp(oldKey)}(\\|[^[\\]\\n]*)?\\]\\]`,
    "g",
  );
  return body.replace(pattern, (_match, aliasPart: string | undefined) =>
    aliasPart ? `[[${pathType}/${newKey}${aliasPart}]]` : `[[${pathType}/${newKey}]]`,
  );
};

// Char class for an entity key — reused so a link's key validity matches the rest of the entity-key
// machinery. Exported for editors building their own anchored link matchers without re-hardcoding it.
export const LINK_KEY_CHAR_CLASS = ENTITY_KEY_CHAR_CLASS;
