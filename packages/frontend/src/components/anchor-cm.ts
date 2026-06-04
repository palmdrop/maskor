import {
  Decoration,
  type DecorationSet,
  EditorView,
  StateEffect,
  StateField,
  type EditorState,
} from "@uiw/react-codemirror";
import type { ParsedAnchor } from "@maskor/shared";
import { blockRanges } from "@lib/margins/block-ranges";

// Comment anchors for the raw/vim (CM6) editor (ADR 0009). The `<!--c:ID-->` marker never lives in
// the live buffer; instead each anchor is held as a document offset and mapped forward through every
// edit, so a comment follows its block deterministically without any marker text in the prose. The
// offsets are re-emitted as markers on save. A subtle line-end dot cues an annotated line.

// Replace the whole anchor set (load, gesture add/remove). The caller passes offsets in the *current*
// document's coordinates; on a plain edit the field maps the existing offsets itself.
export const setCmAnchorsEffect = StateEffect.define<ParsedAnchor[]>();

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

// A quiet locator dot at the end of any line that carries an anchor — the Margin column does the real
// surfacing. Computed from the anchor offsets, recomputed when they or the document change.
const dotCueDecorations = (state: EditorState): DecorationSet => {
  const lineCue = Decoration.line({ class: "cm-has-comment" });
  const seenLines = new Set<number>();
  const ranges = [];
  for (const anchor of getCmAnchors(state)) {
    const offset = Math.max(0, Math.min(anchor.offset, state.doc.length));
    const line = state.doc.lineAt(offset);
    if (seenLines.has(line.from)) continue;
    seenLines.add(line.from);
    ranges.push(lineCue.range(line.from));
  }
  ranges.sort((a, b) => a.from - b.from);
  return Decoration.set(ranges);
};

const dotCueExtension = EditorView.decorations.compute(["doc", cmAnchorField], dotCueDecorations);

const anchorTheme = EditorView.theme({
  ".cm-has-comment": { position: "relative" },
  ".cm-has-comment::after": {
    content: '"●"',
    position: "absolute",
    right: "0.25rem",
    opacity: "0.3",
    fontSize: "0.6em",
    pointerEvents: "none",
  },
});

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

export const cmAnchorExtension = [cmAnchorField, dotCueExtension, anchorTheme];
