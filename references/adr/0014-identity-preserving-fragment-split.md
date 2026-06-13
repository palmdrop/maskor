# Identity-preserving fragment split

**Status**: accepted

## Context

The fragment splitter divides one existing fragment into multiple fragments along a chosen delimiter (heading level, thematic break, or blank-line). The obvious implementation is to replace the source with N equal, brand-new fragments. We rejected that.

## Decision

A split **preserves the original fragment's identity**: the original is truncated to the first piece — keeping its UUID, key, aspects, readiness, references, and every sequence placement — and only pieces 2…N become new fragments. The new pieces are inserted immediately after the original, in order, in **every** sequence the original is placed in (so reading order stays contiguous everywhere). This mirrors `splitSectionAtFragment`, which keeps the "before" in the original section and spawns a new section for the "after".

## Considered options

- **Replace entirely (N equal new fragments).** Conceptually cleanest — all children are peers — but destroys the original's UUID. Its sequence placements vanish, Margin comments orphan wholesale, and any `[[document-links]]`/backlinks break. Rejected: the domain invests heavily in UUID stability.
- **Keep original + N new alongside.** Nothing lost, but the original's full content is duplicated across the new pieces, leaving a redundant fragment the user must discard by hand. Rejected: messy, no clear identity for the result.

## Consequences

- No data is lost: the source content lives on across piece 1 + the new pieces, so the split needs **no source archive** and is recorded as a single non-undoable `fragment:split` action-log entry.
- The new pieces inherit the original's **aspects and references** (readiness resets to 0), treating them as continuations rather than blank fragments.
- **Margin comments** anchored to blocks that move into pieces 2…N cannot stay on the original. Until comment migration ships (a deferred phase), those comments follow the existing orphaned-comment path on the original's Margin and the moved blocks' anchor markers are stripped from the new pieces. The migration phase later moves and re-anchors them into the new piece's Margin instead.

See `specifications/fragment-split.md`.
