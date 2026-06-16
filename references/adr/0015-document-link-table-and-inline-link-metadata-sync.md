# Document links: a persisted link table, canonical full-path syntax, and inline-link metadata auto-sync

Coupled decisions behind the `[[type/key]]` document-link feature (`specifications/document-links.md`).

## 1. Links are a persisted, derived index — a dedicated `links` table

Every `[[type/key]]` edge parsed from a fragment / note / reference body is stored as a row in a `links` table (source type+uuid, target type+key, nullable resolved `target_uuid`, alias, ordinal, snippet). Vault files remain authoritative; the table is re-derivable from them.

**Why a table, not on-demand parsing:** backlinks must be instant on large projects — a full body scan at view time is too slow. The watcher already maintains body-derived indices, so links are one more. The table also serves the rename cascade (which bodies link to X?) without re-scanning every file.

**No cross-type foreign key:** `source_uuid` / `target_uuid` each span four entity tables, so a single FK is impossible. Rows are managed explicitly: `syncLinks` replaces a source's rows on every body upsert; entity appearance binds matching unresolved rows; entity deletion un-binds rows (leaving them broken). `index.rebuild` clears the table, repopulates during upserts, then runs one resolution pass once all entities are known (so a link authored before its target was indexed still binds).

**Unresolved links persist.** A `[[type/key]]` to a missing target is stored with `target_uuid = null` and its raw `target_type` + `target_key`, binding when the target later appears. A bare `[[key]]` whose type can't be resolved stores `target_type = null` too. An unknown-type `[[gibberish/foo]]` is **not** a link — not stored, rendered as plain text.

## 2. Canonical full-path syntax; the path type is plural, the entity kind is singular

Maskor always inserts `[[type/key]]` (full path, no `.md`, no bare). Full-path disambiguates the target type immediately, survives cross-type key collisions, and tells broken-link UI what kind is missing. The parser still accepts bare names and `.md` suffixes for externally-authored (Obsidian) content; bare names resolve by Obsidian's shortest-path rule (on a flat vault: the single entity across types carrying that key; ambiguous → unresolved).

The link **path type** is the plural vault-folder form the user writes (`notes`, `fragments`, …); the DB / API **entity kind** is the singular form used everywhere else (`note`, `fragment`, …). `linkPathTypeToEntityKind` bridges them so the two never drift.

## 3. Links render via decorations, not a schema node — markdown round-trips untouched

In both editors the link text `[[type/key]]` stays in the buffer as ordinary prose and is only *decorated* (resolved vs broken styling) with Cmd/Ctrl-click navigation. There is no custom TipTap node or serializer for links.

**Why:** `[[` / `]]` are not markdown-special, so the text round-trips byte-stable through markdown-it → ProseMirror → markdown with zero special handling. A schema node would add a fragile serialize/parse path for no benefit. (This differs from the comment anchor marker, which *is* a node — it must be stripped from the buffer and re-emitted, ADR 0009.) Cmd/Ctrl-click (not plain click) is used in all modes so navigation never fights caret placement, and behaves identically across rich / raw / vim.

## 4. Inline links auto-sync into fragment metadata — add always, remove asymmetric

On a fragment **content** save (and the watcher external-edit cycle), inline `[[references/…]]` / `[[aspects/…]]` links are merged into the fragment's metadata: references added (deduped), aspects added at weight 0. References are **never** auto-removed (form-curated attachments survive incidental body edits). An aspect at weight 0 with no remaining inline link is **reaped** — weight 0 is treated as "uncommitted."

**Reaping is gated on a body change.** This reconciles the tension with `aspect-arc-model.md` (explicit weight 0 is a valid, distinct value): a pure metadata save never reaps, so a weight-0 aspect set via the form persists; the reap only follows an inline link going away. The merge is idempotent, so the canonical write-back (which lands the merged metadata in frontmatter) hash-guards the follow-up watcher event to a no-op.

**Notes contribute nothing to metadata** (the fragment note attachment was removed — ADR 0007); a `[[notes/foo]]` link is a link-table / backlink citizen only. The metadata form disables a chip's X-button while an inline link pins it — removing it would either loop (re-added next save) or require rewriting the body (destructive). Acknowledged as conservative; flagged for reconsideration in the spec.

## 5. Comments are not links

Reaffirms ADR 0007: comments are anchored Margin blocks bound by a trailing marker, **not** `[[comments/…]]` links. The link machinery never touches the margin/comment machinery.
