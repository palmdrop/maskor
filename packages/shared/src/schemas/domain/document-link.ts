import { z } from "zod";

// A document link is a `[[type/key]]` edge parsed from a body. The link table is a persisted, derived
// index (vault files are authoritative) maintained by the watcher and the write paths — it powers
// backlinks and rename cascade. Entity kinds are the singular form used across the DB / API; the
// plural path form lives only in the link syntax itself (see `utils/document-link.ts`).

// Bodies that can contain links: fragment, note, reference. (Aspect descriptions are not link
// sources — see `specifications/document-links.md`.)
export const LINK_SOURCE_TYPES = ["fragment", "note", "reference"] as const;
export const LinkSourceTypeSchema = z.enum(LINK_SOURCE_TYPES);
export type LinkSourceType = z.infer<typeof LinkSourceTypeSchema>;

// Anything a link may point at.
export const LINK_TARGET_TYPES = ["fragment", "note", "reference", "aspect"] as const;
export const LinkTargetTypeSchema = z.enum(LINK_TARGET_TYPES);
export type LinkTargetType = z.infer<typeof LinkTargetTypeSchema>;

// A forward edge as stored in the link table. `targetUuid` is null for an unresolved link (the target
// does not yet exist); the raw `targetType` + `targetKey` are always preserved so the row binds when
// the target later appears.
export const DocumentLinkSchema = z.object({
  sourceType: LinkSourceTypeSchema,
  sourceUuid: z.uuid(),
  // null for an unresolved bare `[[key]]` link whose type is not yet known.
  targetType: LinkTargetTypeSchema.nullable(),
  targetKey: z.string(),
  targetUuid: z.uuid().nullable(),
  alias: z.string().nullable(),
  ordinal: z.number().int(),
  snippet: z.string().nullable(),
});

export type DocumentLink = z.infer<typeof DocumentLinkSchema>;

// A backlink entry surfaced on an entity page: the referring body, with its key for display and
// navigation plus an optional context snippet.
export const BacklinkSchema = z.object({
  sourceType: LinkSourceTypeSchema,
  sourceUuid: z.uuid(),
  sourceKey: z.string(),
  alias: z.string().nullable(),
  snippet: z.string().nullable(),
});

export type Backlink = z.infer<typeof BacklinkSchema>;
