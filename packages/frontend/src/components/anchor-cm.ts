import { StateEffect, StateField, type EditorState } from "@uiw/react-codemirror";
import { invertedEffects } from "@codemirror/commands";
import type { ParsedAnchor } from "@maskor/shared";
import { blockRanges } from "@lib/margins/block-ranges";

// Comment anchors for the raw/vim (CM6) editor (ADR 0009). The `<!--c:ID-->` marker never lives in
// the live buffer; instead each anchor is held as a document offset and mapped forward through every
// edit, so a comment follows its block deterministically without any marker text in the prose. The
// offsets are re-emitted as markers on save. The Margin column surfaces the binding.

// Replace the whole anchor set (load, gesture add/remove). The caller passes offsets in the *current*
// document's coordinates; on a plain edit the field maps the existing offsets itself. The `map`
// repositions a stored (undo-history) effect through any intervening changes before it is re-applied,
// so a snapshot captured for undo lands at the right offsets even across multiple edits.
export const setCmAnchorsEffect = StateEffect.define<ParsedAnchor[]>({
  map: (anchors, change) =>
    anchors.map((anchor) => ({
      markerId: anchor.markerId,
      offset: change.mapPos(anchor.offset, -1),
    })),
});

export const cmAnchorField = StateField.define<ParsedAnchor[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCmAnchorsEffect)) return effect.value;
    }
    if (!transaction.docChanged) return value;
    // Map each anchor through the edit, but decide orphaning at the *block* level (margins-4): an
    // anchor sits at its block's end, so deleting only the block's last soft-wrapped line would
    // strictly engulf the offset — `MapMode.TrackDel` would wrongly drop the anchor even though the
    // paragraph survives above. Instead, map the anchor's whole block (from the pre-edit doc) and only
    // drop when the block's content fully collapsed (the paragraph was deleted); otherwise remap the
    // anchor into the surviving block. A deleted paragraph still orphans its comment (and re-attaches
    // by excerpt on paste-back); deleting one line of a multi-line paragraph keeps it.
    const oldRanges = blockRanges(transaction.startState.doc.toString());
    const changes = transaction.changes;
    return value.flatMap((anchor) => {
      const block = oldRanges.find(
        (range) => anchor.offset >= range.from && anchor.offset <= range.to,
      );
      // Anchor not inside a known block (e.g. on a blank line) — map plainly and keep.
      if (!block) {
        return [{ markerId: anchor.markerId, offset: changes.mapPos(anchor.offset, -1) }];
      }
      // Map the block's own boundaries inward; if they collapse, the whole paragraph is gone → orphan.
      const from = changes.mapPos(block.from, 1);
      const to = changes.mapPos(block.to, -1);
      if (to <= from) return [];
      const offset = Math.max(from, Math.min(changes.mapPos(anchor.offset, -1), to));
      return [{ markerId: anchor.markerId, offset }];
    });
  },
});

export const getCmAnchors = (state: EditorState): ParsedAnchor[] =>
  state.field(cmAnchorField, false) ?? [];

// Resolve each anchor to the blank-line block (by index) that currently contains it — the Margin
// column binds comments to blocks by this map. An offset at a block's end belongs to that block (a
// blank line separates it from the next, so there is no ambiguity).
export const cmAnchorBlockIndex = (state: EditorState): Map<string, number> => {
  const ranges = blockRanges(state.doc.toString());
  const map = new Map<string, number>();
  for (const anchor of getCmAnchors(state)) {
    const index = ranges.findIndex(
      (range) => anchor.offset >= range.from && anchor.offset <= range.to,
    );
    if (index !== -1) map.set(anchor.markerId, index);
  }
  return map;
};

// Make anchor membership undoable. The field maps anchors forward and *drops* one when its block
// fully collapses (a deleted paragraph), but the StateField is not part of CM6's undo history, so
// undo would revert the prose while leaving the comment orphaned (the "comment disappears on
// delete-then-undo" report). For every edit that touches a non-empty anchor set, store the pre-edit
// set as an inverted effect: on undo CM re-applies it (restoring the exact dropped anchor at its
// original offset), and the symmetric capture on the undo transaction restores the post-edit set on
// redo. Edits never *add* anchors (only the gesture/load effect does), so an empty pre-edit set needs
// no snapshot.
const cmAnchorHistory = invertedEffects.of((transaction) => {
  if (!transaction.docChanged) return [];
  const before = getCmAnchors(transaction.startState);
  if (before.length === 0) return [];
  return [setCmAnchorsEffect.of(before)];
});

export const cmAnchorExtension = [cmAnchorField, cmAnchorHistory];
