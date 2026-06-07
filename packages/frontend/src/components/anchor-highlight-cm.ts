import {
  Decoration,
  type DecorationSet,
  EditorView,
  StateEffect,
  StateField,
  type EditorState,
} from "@uiw/react-codemirror";
import { blockRanges } from "@lib/margins/block-ranges";
import { cmAnchorField, getCmAnchors } from "./anchor-cm";

// Reciprocal connection cue (vim/raw): tint the block a Margin comment is anchored to while that
// comment is hovered/focused, so the writer can see which paragraph a comment belongs to without
// leader lines or in-prose marks. Presentation only — a line decoration set via an effect, never a
// buffer edit. The Margin drives it through `setHighlightedAnchor(markerId | null)`.

export const setHighlightedAnchorEffect = StateEffect.define<string | null>();

const highlightedAnchorField = StateField.define<string | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHighlightedAnchorEffect)) return effect.value;
    }
    return value;
  },
});

const lineHighlight = Decoration.line({ class: "cm-anchor-highlight" });

// Every line of the highlighted anchor's block gets the line decoration (a block can span several
// soft-wrapped / non-blank lines). Exported for unit testing the anchor→highlighted-line mapping.
export const buildHighlightDecorations = (state: EditorState): DecorationSet => {
  const markerId = state.field(highlightedAnchorField);
  if (!markerId) return Decoration.none;
  const anchor = getCmAnchors(state).find((entry) => entry.markerId === markerId);
  if (!anchor) return Decoration.none;
  const block = blockRanges(state.doc.toString()).find(
    (range) => anchor.offset >= range.from && anchor.offset <= range.to,
  );
  if (!block) return Decoration.none;
  const decorations = [];
  let pos = block.from;
  while (pos <= block.to) {
    const line = state.doc.lineAt(pos);
    decorations.push(lineHighlight.range(line.from));
    if (line.to >= block.to) break;
    pos = line.to + 1;
  }
  return Decoration.set(decorations, true);
};

const highlightDecorations = EditorView.decorations.compute(
  ["doc", highlightedAnchorField, cmAnchorField],
  buildHighlightDecorations,
);

const highlightTheme = EditorView.baseTheme({
  ".cm-line.cm-anchor-highlight": {
    backgroundColor: "color-mix(in srgb, var(--color-muted-foreground) 14%, transparent)",
  },
});

export const cmAnchorHighlightExtension = [
  highlightedAnchorField,
  highlightDecorations,
  highlightTheme,
];
