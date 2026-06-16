import { randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  parseDocumentLinks,
  linkPathTypeToEntityKind,
  stripCommentMarkers,
  type LinkEntityKind,
} from "@maskor/shared";
import {
  aspectsTable,
  fragmentsTable,
  linksTable,
  notesTable,
  referencesTable,
} from "../db/vault/schema";
import type { VaultDatabase } from "../db/vault";
import type { Transaction } from "./upserts";

// Bodies that can hold links — the singular DB entity kind.
export type LinkSourceType = "fragment" | "note" | "reference";

// A short single-line context snippet around a link, for the backlinks panel. Window of ~MAX chars
// centred on the link, markers stripped, whitespace collapsed.
const SNIPPET_MAX_LENGTH = 120;
const deriveSnippet = (body: string, index: number, rawLength: number): string => {
  const half = Math.floor((SNIPPET_MAX_LENGTH - rawLength) / 2);
  const start = Math.max(0, index - Math.max(half, 0));
  const end = Math.min(body.length, index + rawLength + Math.max(half, 0));
  const slice = body.slice(start, end);
  const cleaned = stripCommentMarkers(slice).replace(/\s+/g, " ").trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return `${prefix}${cleaned}${suffix}`;
};

// Resolve a (kind, key) target to its entity UUID, or null if no such entity exists. Fragments prefer
// the active file over a discarded one with the same key.
const queryEntityUuid = (tx: Transaction, kind: LinkEntityKind, key: string): string | null => {
  switch (kind) {
    case "fragment": {
      const active = tx
        .select({ uuid: fragmentsTable.uuid })
        .from(fragmentsTable)
        .where(and(eq(fragmentsTable.key, key), eq(fragmentsTable.isDiscarded, false)))
        .get();
      if (active) return active.uuid;
      const any = tx
        .select({ uuid: fragmentsTable.uuid })
        .from(fragmentsTable)
        .where(eq(fragmentsTable.key, key))
        .get();
      return any?.uuid ?? null;
    }
    case "note":
      return (
        tx.select({ uuid: notesTable.uuid }).from(notesTable).where(eq(notesTable.key, key)).get()
          ?.uuid ?? null
      );
    case "reference":
      return (
        tx
          .select({ uuid: referencesTable.uuid })
          .from(referencesTable)
          .where(eq(referencesTable.key, key))
          .get()?.uuid ?? null
      );
    case "aspect":
      return (
        tx
          .select({ uuid: aspectsTable.uuid })
          .from(aspectsTable)
          .where(eq(aspectsTable.key, key))
          .get()?.uuid ?? null
      );
  }
};

const ALL_KINDS: LinkEntityKind[] = ["fragment", "note", "reference", "aspect"];

// Resolve a bare-name link (`[[key]]`, no type) using Obsidian's shortest-path rule. Folders are flat,
// so a bare name resolves to the single entity (across all types) carrying that key; if it matches
// multiple types it is ambiguous and stays unresolved.
const resolveBareTarget = (
  tx: Transaction,
  key: string,
): { targetType: LinkEntityKind; targetUuid: string } | null => {
  const matches = ALL_KINDS.flatMap((kind) => {
    const uuid = queryEntityUuid(tx, kind, key);
    return uuid ? [{ targetType: kind, targetUuid: uuid }] : [];
  });
  return matches.length === 1 ? matches[0]! : null;
};

// Replace the link rows for one source body. Parses the body, resolves each target against the current
// DB state, and writes one row per link. Unresolved (typed) links keep their `targetType` with a null
// `targetUuid`; unresolved bare links keep a null `targetType` too.
export const syncLinks = (
  tx: Transaction,
  sourceType: LinkSourceType,
  sourceUuid: string,
  body: string,
): void => {
  tx.delete(linksTable)
    .where(and(eq(linksTable.sourceType, sourceType), eq(linksTable.sourceUuid, sourceUuid)))
    .run();

  const links = parseDocumentLinks(body);
  const syncedAt = new Date();

  links.forEach((link, ordinal) => {
    let targetType: LinkEntityKind | null;
    let targetUuid: string | null;

    if (link.targetType === null) {
      const resolved = resolveBareTarget(tx, link.targetKey);
      targetType = resolved?.targetType ?? null;
      targetUuid = resolved?.targetUuid ?? null;
    } else {
      targetType = linkPathTypeToEntityKind(link.targetType);
      targetUuid = queryEntityUuid(tx, targetType, link.targetKey);
    }

    tx.insert(linksTable)
      .values({
        id: randomUUID(),
        sourceType,
        sourceUuid,
        targetType,
        targetKey: link.targetKey,
        targetUuid,
        alias: link.alias,
        ordinal,
        snippet: deriveSnippet(body, link.index, link.raw.length),
        syncedAt,
      })
      .run();
  });
};

// Delete every link originating from a source (the source body was removed).
export const deleteLinksForSource = (
  tx: Transaction,
  sourceType: LinkSourceType,
  sourceUuid: string,
): void => {
  tx.delete(linksTable)
    .where(and(eq(linksTable.sourceType, sourceType), eq(linksTable.sourceUuid, sourceUuid)))
    .run();
};

// An entity (kind, key) appeared — bind every unresolved link that points at it: typed links matching
// the kind, and bare links (null type) matching the key. Sets both `targetUuid` and `targetType`.
export const bindUnresolvedLinks = (
  tx: Transaction,
  kind: LinkEntityKind,
  key: string,
  uuid: string,
): void => {
  tx.update(linksTable)
    .set({ targetUuid: uuid, targetType: kind })
    .where(
      and(
        eq(linksTable.targetKey, key),
        isNull(linksTable.targetUuid),
        or(eq(linksTable.targetType, kind), isNull(linksTable.targetType)),
      ),
    )
    .run();
};

// An entity (kind, key) was deleted — un-bind every link that resolved to it (the row stays as a
// broken link; bodies are never auto-rewritten). `targetType` is kept so the row re-binds if an entity
// of the same kind/key reappears.
export const unbindLinksForTarget = (tx: Transaction, kind: LinkEntityKind, key: string): void => {
  tx.update(linksTable)
    .set({ targetUuid: null })
    .where(and(eq(linksTable.targetType, kind), eq(linksTable.targetKey, key)))
    .run();
};

// Resolve every currently-unresolved link against the full DB state. Run at the tail of a rebuild,
// after all entities are upserted, so a link authored before its target was indexed still binds.
export const resolveAllLinks = (tx: Transaction): void => {
  const unresolved = tx
    .select({
      id: linksTable.id,
      targetType: linksTable.targetType,
      targetKey: linksTable.targetKey,
    })
    .from(linksTable)
    .where(isNull(linksTable.targetUuid))
    .all();

  for (const row of unresolved) {
    if (row.targetType === null) {
      const resolved = resolveBareTarget(tx, row.targetKey);
      if (resolved) {
        tx.update(linksTable)
          .set({ targetType: resolved.targetType, targetUuid: resolved.targetUuid })
          .where(eq(linksTable.id, row.id))
          .run();
      }
      continue;
    }
    const uuid = queryEntityUuid(tx, row.targetType as LinkEntityKind, row.targetKey);
    if (uuid) {
      tx.update(linksTable).set({ targetUuid: uuid }).where(eq(linksTable.id, row.id)).run();
    }
  }
};

// --- read helpers (run on the live DB, outside a write transaction) ---

const SOURCE_KEY_QUERY: Record<LinkSourceType, (db: VaultDatabase, uuid: string) => string | null> =
  {
    fragment: (db, uuid) =>
      db
        .select({ key: fragmentsTable.key })
        .from(fragmentsTable)
        .where(eq(fragmentsTable.uuid, uuid))
        .get()?.key ?? null,
    note: (db, uuid) =>
      db.select({ key: notesTable.key }).from(notesTable).where(eq(notesTable.uuid, uuid)).get()
        ?.key ?? null,
    reference: (db, uuid) =>
      db
        .select({ key: referencesTable.key })
        .from(referencesTable)
        .where(eq(referencesTable.uuid, uuid))
        .get()?.key ?? null,
  };

export type BacklinkRow = {
  sourceType: LinkSourceType;
  sourceUuid: string;
  sourceKey: string;
  alias: string | null;
  snippet: string | null;
};

// Every body that links to (kind, key) — the backlinks panel source. Reads the persisted table only
// (no body re-scan). Rows whose source entity no longer exists are skipped.
export const findBacklinks = (
  db: VaultDatabase,
  kind: LinkEntityKind,
  key: string,
): BacklinkRow[] => {
  const rows = db
    .select({
      sourceType: linksTable.sourceType,
      sourceUuid: linksTable.sourceUuid,
      alias: linksTable.alias,
      snippet: linksTable.snippet,
    })
    .from(linksTable)
    .where(and(eq(linksTable.targetType, kind), eq(linksTable.targetKey, key)))
    .all();

  // One entry per referring body, even if it links the target multiple times (the first link's
  // alias/snippet wins). Backlinks list "every body that links to it," not every link.
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (seen.has(row.sourceUuid)) return [];
    seen.add(row.sourceUuid);
    const sourceType = row.sourceType as LinkSourceType;
    const sourceKey = SOURCE_KEY_QUERY[sourceType]?.(db, row.sourceUuid) ?? null;
    if (sourceKey === null) return [];
    return [
      {
        sourceType,
        sourceUuid: row.sourceUuid,
        sourceKey,
        alias: row.alias,
        snippet: row.snippet,
      },
    ];
  });
};

// Distinct source UUIDs of one source type that link to (targetKind, targetKey). Backs the rename
// cascade — the set of bodies whose inline `[[targetKind/targetKey]]` links must be rewritten.
export const findLinkSourceUuids = (
  db: VaultDatabase,
  targetKind: LinkEntityKind,
  targetKey: string,
  sourceType: LinkSourceType,
): string[] => {
  const rows = db
    .select({ sourceUuid: linksTable.sourceUuid })
    .from(linksTable)
    .where(
      and(
        eq(linksTable.targetType, targetKind),
        eq(linksTable.targetKey, targetKey),
        eq(linksTable.sourceType, sourceType),
      ),
    )
    .all();
  return [...new Set(rows.map((row) => row.sourceUuid))];
};

export type OutgoingLinkRow = {
  targetType: LinkEntityKind | null;
  targetKey: string;
  targetUuid: string | null;
  alias: string | null;
};

// Every link originating from a source body. Backs the metadata-form X-button rule (which references /
// aspects are linked inline) and any outgoing-link surface.
export const findOutgoingLinks = (
  db: VaultDatabase,
  sourceType: LinkSourceType,
  sourceUuid: string,
): OutgoingLinkRow[] =>
  db
    .select({
      targetType: linksTable.targetType,
      targetKey: linksTable.targetKey,
      targetUuid: linksTable.targetUuid,
      alias: linksTable.alias,
    })
    .from(linksTable)
    .where(and(eq(linksTable.sourceType, sourceType), eq(linksTable.sourceUuid, sourceUuid)))
    .orderBy(linksTable.ordinal)
    .all()
    .map((row) => ({ ...row, targetType: row.targetType as LinkEntityKind | null }));
