import {
  Decoration,
  type DecorationSet,
  EditorView,
  StateEffect,
  StateField,
  WidgetType,
  type EditorState,
} from "@uiw/react-codemirror";
import { blockRanges } from "@lib/margins/block-ranges";

// Document-side flow alignment for the raw/vim (CM6) editor (ADR 0009): a block widget injects
// vertical space below a block so a Margin comment taller than its block pushes the next block down.
// Presentation only — the spacer is a decoration, never buffer text, and is set via an effect (no doc
// change), so it never dirties the buffer. Spacers are indexed by blank-line block.

class SpacerWidget extends WidgetType {
  height: number;
  constructor(height: number) {
    super();
    this.height = height;
  }
  eq(other: SpacerWidget): boolean {
    return other.height === this.height;
  }
  toDOM(): HTMLElement {
    const element = document.createElement("div");
    element.style.height = `${this.height}px`;
    element.setAttribute("aria-hidden", "true");
    element.dataset.blockSpacer = "true";
    return element;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

export const setCmSpacersEffect = StateEffect.define<number[]>();

const spacerState = StateField.define<number[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCmSpacersEffect)) return effect.value;
    }
    return value;
  },
});

const buildSpacerDecorations = (state: EditorState, spacers: readonly number[]): DecorationSet => {
  const decorations = blockRanges(state.doc.toString()).flatMap((range, index) => {
    const spacer = spacers[index] ?? 0;
    if (spacer <= 0) return [];
    return [
      Decoration.widget({ widget: new SpacerWidget(spacer), block: true, side: 1 }).range(range.to),
    ];
  });
  return Decoration.set(decorations, true);
};

// Recompute when the spacers change or the document edits (block positions shift).
const spacerDecorations = EditorView.decorations.compute(["doc", spacerState], (state) =>
  buildSpacerDecorations(state, state.field(spacerState)),
);

export const cmBlockSpacerExtension = [spacerState, spacerDecorations];
