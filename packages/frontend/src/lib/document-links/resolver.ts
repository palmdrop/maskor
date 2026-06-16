import { parseDocumentLinks, type LinkPathType, type ParsedDocumentLink } from "@maskor/shared";

// key -> uuid for each entity type, used to resolve a `[[type/key]]` link to a navigable target.
export type LinkLookups = {
  fragments: Map<string, string>;
  notes: Map<string, string>;
  references: Map<string, string>;
  aspects: Map<string, string>;
};

export const EMPTY_LINK_LOOKUPS: LinkLookups = {
  fragments: new Map(),
  notes: new Map(),
  references: new Map(),
  aspects: new Map(),
};

// A link resolved (or not) against the current project entities.
export type ResolvedLink = {
  // The concrete path type. For a bare `[[key]]` link this is the discovered type, or null if it
  // could not be resolved to exactly one entity.
  pathType: LinkPathType | null;
  key: string;
  alias: string | null;
  uuid: string | null; // null => broken (no such entity)
  // The visible label: the alias if present, else the bare key (Obsidian shows the key, not the path).
  label: string;
};

const ALL_PATH_TYPES: LinkPathType[] = ["fragments", "notes", "references", "aspects"];

// Resolve a parsed link against the lookups. A typed link resolves within its type; a bare link
// resolves only if exactly one entity across all types carries the key (Obsidian's shortest-path rule
// on a flat vault).
export const resolveParsedLink = (
  parsed: ParsedDocumentLink,
  lookups: LinkLookups,
): ResolvedLink => {
  const label = parsed.alias ?? parsed.targetKey;

  if (parsed.targetType !== null) {
    const uuid = lookups[parsed.targetType].get(parsed.targetKey) ?? null;
    return { pathType: parsed.targetType, key: parsed.targetKey, alias: parsed.alias, uuid, label };
  }

  const matches = ALL_PATH_TYPES.flatMap((pathType) => {
    const uuid = lookups[pathType].get(parsed.targetKey);
    return uuid ? [{ pathType, uuid }] : [];
  });
  if (matches.length === 1) {
    return {
      pathType: matches[0]!.pathType,
      key: parsed.targetKey,
      alias: parsed.alias,
      uuid: matches[0]!.uuid,
      label,
    };
  }
  return { pathType: null, key: parsed.targetKey, alias: parsed.alias, uuid: null, label };
};

// A link occurrence in a body, with its character range and resolution. Drives editor decorations.
export type LinkRange = {
  from: number;
  to: number;
  resolved: ResolvedLink;
  raw: string;
};

export const findLinkRanges = (text: string, lookups: LinkLookups): LinkRange[] =>
  parseDocumentLinks(text).map((parsed) => ({
    from: parsed.index,
    to: parsed.index + parsed.raw.length,
    resolved: resolveParsedLink(parsed, lookups),
    raw: parsed.raw,
  }));

// The TanStack route + params for navigating to a resolved link target.
export const linkRouteFor = (
  pathType: LinkPathType,
  uuid: string,
  projectId: string,
): { to: string; params: Record<string, string> } => {
  switch (pathType) {
    case "fragments":
      return {
        to: "/projects/$projectId/fragments/$fragmentId",
        params: { projectId, fragmentId: uuid },
      };
    case "notes":
      return { to: "/projects/$projectId/notes/$noteId", params: { projectId, noteId: uuid } };
    case "references":
      return {
        to: "/projects/$projectId/references/$referenceId",
        params: { projectId, referenceId: uuid },
      };
    case "aspects":
      return {
        to: "/projects/$projectId/aspects/$aspectId",
        params: { projectId, aspectId: uuid },
      };
  }
};
