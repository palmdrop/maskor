# Review: Fragment Split

**Date**: 2026-06-13
**Scope**: `packages/importer`, `packages/api`, `packages/frontend`, `packages/shared`
**Plan**: `references/plans/fragment-split.md`
**Spec**: `specifications/fragment-split.md`

---

## Overall

The feature is implemented end-to-end and matches the plan closely: shared engine modes, lean preview command, identity-preserving split command, dialog, surfaces, and Margin migration are all present with good test coverage (engine modes, command behaviour, margin migration, scope wiring, dialog). The wiring is clean and reuses `deriveKey` / `splitByDelimiter` / `placeFragment` as the spec demands.

Two findings deserve attention before this is considered fully sound. First, the commit path **truncates the original before the new pieces are persisted** — a failure mid-operation loses content, directly against the spec's "a split never loses content" constraint. Second, **heading-mode silently drops the heading line from the body**, which is correct for import but is a genuine content loss for a fragment split and contradicts the same invariant. Both are flagged below.

---

## Bugs

### 1. Original is truncated before the new pieces are persisted — content-loss window on partial failure

`packages/api/src/commands/fragments/split-fragment.ts:66-95` — the original fragment is truncated to piece 1 (`fragments.write`, line 67) **before** the loop that creates pieces 2…N (lines 78-95). Each write is a separately-locked operation; there is no transaction spanning them. If any piece write fails (storage/IO error, or an unforeseen `KEY_CONFLICT`), the original has already been shrunk to piece 1, the prose for pieces 2…N exists only in whatever new fragments happened to be written so far, and `executeCommand` records a `command:error` rather than a `fragment:split` entry.

```
truncate original → piece 1   (committed)
create piece 2                (committed)
create piece 3                (throws)  → pieces 4…N prose is gone from the original, never written
```

The spec is explicit: "A split never loses content: the source prose is fully preserved across piece 1 + the new pieces." Truncating first breaks that on the failure path.

Fix: create (and confirm the writes of) the new pieces first, then truncate the original as the last fragment write. The original then remains the intact source until every piece is safely on disk.

---

## Design

### 2. Heading-mode drops the heading line from piece content — contradicts the "no content loss" invariant

`packages/importer/src/index.ts:90-123` (`splitMarkdown`) deliberately excludes the heading line from each piece's content (it survives only as `title`, consumed by `deriveKey`). This is verified intentional (`splitting.test.ts` "excludes the heading line from piece content"; `split-fragment.test.ts:96` asserts the source becomes `"Intro body"`, dropping `# Intro`).

For **import** this is correct — the heading becomes the entity title. For a **fragment split** there is no title field: the heading text is reduced to a sanitised, 8-word-capped *key*, and the `## Heading` markdown plus any words/symbols beyond the cap are permanently removed from the prose. So splitting a fragment on headings mutates the body in a lossy way, contradicting the spec constraint quoted in #1 and the implicit promise of acceptance criterion "content equal to the first piece".

This may be an accepted trade-off of reusing one engine, but it is surprising and undocumented as a loss. Per CLAUDE.md ("flag unintended consequences"): either (a) preserve the heading line in the piece body for the split path, or (b) document in the spec that heading-mode intentionally consumes the heading line into the key, and reconcile the "never loses content" wording. Right now spec text and behaviour disagree.

### 3. The split is non-atomic across many writes with no rollback

`split-fragment.ts:67-174` performs N fragment writes + M sequence writes + up to N margin writes, each under its own `withVaultWriteLock` acquisition, with no enclosing transaction. Beyond the data-loss window in #1, any mid-sequence failure leaves the vault in a partially-split state (some new fragments created and placed, original possibly truncated) with no `fragment:split` log entry and no undo (the entry is non-undoable by design). For a greenfield tool this may be acceptable, but it is worth a deliberate decision: at minimum, ordering the original truncation last (#1) shrinks the blast radius to "extra orphan fragments" rather than "lost prose".

---

## Minor

### 4. Dialog can briefly offer Confirm with a stale piece count

`packages/frontend/src/components/fragments/SplitFragmentDialog.tsx:84-112` — `pieces` is only cleared when the dialog closes, not when the delimiter changes. Between switching to a delimiter that yields a single piece and the preview response arriving, `canConfirm` (`pieceCount > 1`) is computed from the previous delimiter's pieces, so Confirm stays enabled. Clicking it is caught by the backend `SplitNoOpError` and surfaced as `splitError`, so no harm — but the UX flickers. Optionally clear `pieces` (or gate `canConfirm` on `!previewSplit.isPending`) when the delimiter changes.

### 5. Warning threshold wording vs. spec phrasing

`SplitFragmentDialog.tsx:36,231-235` triggers the warning at `pieceCount > 10` (i.e. 11+ pieces = 10+ new fragments) and prints "create {pieceCount - 1} new fragments". The spec says "more than 10 fragments". Whether "fragments" means total pieces or new fragments is ambiguous; the implementation is reasonable but the boundary (11 pieces / 10 new) is worth pinning down in the spec so the two don't drift.

---

## Non-issues

- **Sequential vault-lock acquisitions** — `fragments.write`, `margins.write`, `sequences.write` each take `withVaultWriteLock` independently, but the command `await`s them in series, so there is no re-entrant acquisition or deadlock. (Atomicity is a separate concern, see #3.)
- **New pieces' Margin writes resolve their fragment** — `fragments.write` updates the index inline, so `persistMargin`'s `findByUUID` for a just-created piece succeeds before the watcher fires.
- **Anchor markers ride along (not stripped)** — keeping `<!--c:ID-->` on the moved block is intentional and required for re-anchoring; `deriveKey` strips markers via `stripCommentMarkers` so they never leak into keys (`split-fragment.test.ts:226-229` covers this).
- **`existingKeys` excludes discarded fragments** — matches the create path's key namespace (active vs discarded are separate), and `fragments.write` only conflicts within the same namespace, so derived keys can coincide with a discarded fragment's key without error. Consistent with the rest of the codebase.
- **`deriveKey` case handling** — base key keeps original case while collision checks and the set are lowercased; correct and matches import.
- **Preview recomputes `deriveKey` against a per-request set including the original's key** — piece 1 reports the original's key verbatim and later pieces never false-collide with it; matches the commit path exactly.
- **Single `fragment:split` log entry, no per-piece `fragment:created`** — intentional, mirrors `fragment:imported` (spec + `action.ts:220-232`).

---

## Notes

I did not re-run `bun run verify`; Phase 7 records it as run. Findings #1 and #2 are about the data-preservation invariant the spec states, not about test failures — the existing tests pass *because* they assert the current (lossy/early-truncate) behaviour.

---

## Resolution (2026-06-13)

All findings addressed; `bun run verify` green (typecheck, OpenAPI sync, 796+ tests, 0 fail).

1. **Fixed.** `splitFragmentCommand` now creates pieces 2…N first and truncates the original **last**, so a mid-operation failure leaves the source prose intact. New test: "preserves all prose across the resulting pieces (no content loss)".
2. **Fixed.** Added a `retainHeadingInContent` option to `splitMarkdown`/`splitByDelimiter`; the split path enables it so heading lines stay in piece bodies (import keeps the old drop-into-title behaviour). Consequence: a heading-anchored comment now follows its heading into its piece instead of orphaning — spec, tests, and the margin-migration semantics updated accordingly.
3. **Mitigated** by the #1 reorder (worst case is now orphan fragments, not lost prose). Full cross-write atomicity still absent — logged in `references/suggestions.md` as a deliberate residual.
4. **Fixed.** Dialog `canConfirm` now also gates on `!previewSplit.isPending`, so a stale piece count can't enable Confirm between a delimiter change and its preview landing.
5. **Fixed.** Warning now reads "create N new fragments (M total)"; the threshold's meaning is pinned in a comment and in the spec.
