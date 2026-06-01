# Review: Margins (plan phases 0–3)

**Date**: 2026-06-01
**Scope**: `packages/shared`, `packages/storage`, `packages/api`, `packages/exporter`, `packages/frontend`
**Plan**: `references/plans/margins.md` (phases 0–3)
**Spec**: `specifications/margins.md`
**Status**: All findings (1–5) resolved 2026-06-01 — see the per-item **Resolved** notes; tests added; full `bun run verify` green.

---

## Overall

The implementation tracks the plan and spec closely and reuses the existing reader/indexer/watcher/command patterns well — the shared `comment-marker.ts` helper, the per-comment DB rows, the orphan-derivation flow, and the export-strip chokepoint are all in the right places, and test coverage is good (vault round-trip, watcher live orphan rebind, export strip, editor round-trip). Two real robustness gaps stand out: externally-malformed Margin files can abort the whole index rebuild (item 1), and orphan-state changes from API-driven fragment edits never emit `margin:synced` (item 2). Everything else is minor.

---

## Bugs

### 1. An externally-malformed Margin file can abort the entire vault rebuild

`packages/storage/src/indexer/indexer.ts:221` and `packages/storage/src/indexer/upserts.ts:383`

Margins are read **without adoption** (`vault.margins.readAllWithFilePaths()`, no UUID minting) and `marginMapper.fromFile` does no validation — it casts `frontmatter.fragmentUuid as string` and `parseComments` emits one `Comment` per `<!--c:ID-->` line verbatim. `readEntitiesSettled` only isolates files that _throw during parse_; a structurally-parseable-but-semantically-bad Margin sails through and is written in the single rebuild transaction.

Two concrete bad inputs, both plausible in the Obsidian external-editing workflow the spec explicitly supports:

```
duplicate marker id in the comments section
  → parseComments yields two Comments with the same markerId
  → upsertMargin: commentsTable PK is (fragmentUuid, markerId)
  → second `.insert(...).run()` (no onConflict) throws a constraint error
  → throw escapes vaultDatabase.transaction(...) in rebuild → whole rebuild aborts
```

```
margins/foo.md created by hand with no fragmentUuid frontmatter
  → fromFile returns fragmentUuid: undefined
  → upsertMargin inserts a junk margins row (NULL PK) + NULL-keyed comments
  → silently mis-indexed; never surfaced as INVALID_ENTITY_FILE
```

Fragments/aspects/notes are protected here by UUID adoption; margins have neither adoption nor a required-field guard. The duplicate-marker case is the worst: one bad file wedges the index for _every_ entity until the file is fixed.

Fix: validate in `marginMapper.fromFile` (or the margin sync/rebuild path) that `fragmentUuid` is present and well-formed, and dedupe `markerId` within a Margin (last-wins, or skip-and-warn). Route the failure through the existing `INVALID_ENTITY_FILE` warning path so one bad file is isolated rather than aborting the batch. Alternatively, give `upsertMargin`'s comment insert an `onConflictDoUpdate` on `(fragmentUuid, markerId)`.

**Resolved 2026-06-01**: `fromFile` now throws `INVALID_ENTITY_FILE` on absent/empty `fragmentUuid`; `parseComments` dedupes `markerId` (first position, last content); `upsertMargin`'s comment insert uses `onConflictDoUpdate` on `(fragmentUuid, markerId)`; rebuild feeds `marginResult.failures` into `invalidFileWarnings`. Tests added in `mappers/margin.test.ts`.

---

## Design

### 2. API-driven fragment edits recompute orphan flags but emit no `margin:synced`

`packages/storage/src/service/storage-service.ts:822`

`fragments.write` correctly calls `recomputeMarginOrphans(...)` inline after its DB transaction, so the orphan flags are updated. But it emits no `margin:synced` event. The watcher would normally fill that gap, but it can't: the inline write already stored the fragment's `contentHash`, so when the watcher fires for the same file, `syncFragment` hits its hash-guard (`fragment.ts:114`) and returns early — _before_ its own `recomputeMarginOrphans` + `margin:synced` emit at `fragment.ts:144`.

Net effect: editing a fragment through the API and thereby orphaning/rebinding a comment never notifies any client of the Margin change. The external-edit path (`syncFragment`) does emit it, so the two paths are asymmetric. This is latent until the Phase 6/7 panel exists, but Phase 2 explicitly lists `margin:synced` on fragment-edit orphan recompute as shipped behaviour.

Fix: have `fragments.write` emit `margin:synced` (for the bound `fragmentUuid`) when `recomputeMarginOrphans` returns `true`. The function already returns a `changed` boolean for exactly this.

**Resolved 2026-06-01**: `fragments.write` now emits `margin:synced` when `recomputeMarginOrphans` returns `true`. Test added in `storage-service.test.ts`.

### 3. Margin lifecycle cascades update the vault but not the inline DB row

`packages/storage/src/service/storage-service.ts:800,893,979,1027`

Fragment rename/discard/restore/delete update the fragment's own DB row inline (closing the stale-index window), but the paired `margins.rename/discard/restore/delete` calls only move the file — the `margins`/`comments` rows are left stale until the watcher processes the move (unlink old path → cascade-delete row + comments, then add new path → re-insert). For fragments the inline update is deliberate; margins silently depend on the watcher instead. It self-heals, but it's an inconsistency worth a comment at minimum, and a brief window where `margins.findByFragmentUuid` returns a stale `filePath`/`fragmentKey` or nothing.

**Resolved 2026-06-01**: added `relocateMarginInIndex` / `deleteMarginByFragmentUuid`, wired inline into `fragments.write` (rename), `discard`, `restore`, and `delete` so the margin index moves in step with the file (watcher becomes a no-op). Tests added in `storage-service.test.ts`.

---

## Minor

### 4. Marker char-class duplicated instead of reusing the shared module

`packages/storage/src/vault/markdown/mappers/margin.ts:12` and `packages/frontend/src/components/comment-marker-extension.ts:12`

`MARKER_LINE_REGEX` and `INLINE_MARKER` both re-hardcode `[A-Za-z0-9_-]+`, which is exactly `MARKER_ID_CHAR_CLASS` in the shared `comment-marker.ts`. CLAUDE.md asks to break out overlap into reusable functions; the shared module already exists for this. Export the char-class (or an anchored-token regex factory) and reuse it so the three definitions can't drift.

**Resolved 2026-06-01**: `MARKER_ID_CHAR_CLASS` is now exported from `comment-marker.ts`; the margin mapper and TipTap extension build their anchored regexes from it.

### 5. A comment body beginning with a blockquote line folds into the excerpt on re-parse

`packages/storage/src/vault/markdown/mappers/margin.ts:28`

`parseComments` treats the contiguous run of leading `>` lines after a marker as the excerpt, then the rest as body. A comment whose **body** legitimately starts with a `> quote` is indistinguishable from the excerpt on read, so a vault→DB→vault round-trip would migrate those lines from body into excerpt. Edge case (excerpts are normally Maskor-seeded), but it breaks the "round-trip preserves comment bodies" guarantee for hand-edited Margins. A body-start delimiter, or a blank line required between excerpt and body, would remove the ambiguity.

**Resolved 2026-06-01**: the serializer now emits a blank line before the body so a body starting with `>` round-trips; the reader stays tolerant of the old no-blank form. Test added in `mappers/margin.test.ts`. (Note: this slightly changes the on-disk Margin format — greenfield, no migration.)

---

## Non-issues

- **Module-level global `COMMENT_MARKER_REGEX`** — safe despite shared `lastIndex`: `matchAll` operates on an internal clone and `replace` resets `lastIndex`. The author added `createCommentMarkerTokenRegex()` specifically for stateful in-editor callers. Correct.
- **Comments immediately flagged orphaned when written before the marker lands in the fragment body** — intended per spec (the gesture's coordinated edits persist independently; transient desync = orphan, self-heals on next fragment save).
- **CM6 reveal granularity is per line, not per markdown block** — documented and accepted in the plan ("granular block ≈ line").
- **Markers stripped only at export/preview assembly, left verbatim in the buffer/vault** — intended; they are invisible in rendered markdown and the vault is authoritative.
- **`upsertMargin` pre-deletes a row colliding on `filePath` under a different `fragmentUuid`** — correct handling of an external rename that remaps a stem to a different fragment.
