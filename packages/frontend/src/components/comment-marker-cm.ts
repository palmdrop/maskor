import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  type EditorState,
  RangeSetBuilder,
} from "@uiw/react-codemirror";
import { createCommentMarkerTokenRegex } from "@maskor/shared";

// CM6 (raw/vim mode) rendering of Margin anchor markers, Obsidian live-preview style:
//   - the whole `<!--c:ID-->` is hidden with a zero-width replace (no gap in the prose),
//   - a line carrying a marker gets a `cm-has-comment` class for a subtle line-end cue,
//   - the raw marker is revealed (un-hidden) only while the cursor is on that line.
// The marker is always preserved verbatim in the buffer — only its rendering changes.

// Hidden marker: a zero-width atomic replacement, so the caret cannot land inside it and nothing
// shows where it sat.
const hiddenMarker = Decoration.replace({});
const commentLine = Decoration.line({ class: "cm-has-comment" });

// Pure over EditorState (whole doc) so it is unit-testable without a live EditorView. Fragments are
// short, so scanning every line is cheap.
export const commentMarkerDecorations = (state: EditorState): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const matches = [...line.text.matchAll(createCommentMarkerTokenRegex())];
    if (matches.length === 0) continue;

    builder.add(line.from, line.from, commentLine);

    // Reveal the raw marker(s) while editing this line; hide them otherwise.
    if (lineNumber === cursorLine) continue;
    for (const match of matches) {
      const start = line.from + (match.index ?? 0);
      builder.add(start, start + match[0].length, hiddenMarker);
    }
  }

  return builder.finish();
};

const commentMarkerTheme = EditorView.theme({
  ".cm-has-comment": {
    // A quiet locator at the line's end — the side panel does the real surfacing.
    position: "relative",
  },
  ".cm-has-comment::after": {
    content: '"💬"',
    position: "absolute",
    right: "0.25rem",
    opacity: "0.35",
    fontSize: "0.75em",
    pointerEvents: "none",
  },
});

const commentMarkerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = commentMarkerDecorations(view.state);
    }
    update(update: ViewUpdate) {
      // Recompute on edits (markers appear/move) and on cursor moves (reveal toggles per line).
      if (update.docChanged || update.selectionSet) {
        this.decorations = commentMarkerDecorations(update.state);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

export const commentMarkerExtension = [commentMarkerPlugin, commentMarkerTheme];
