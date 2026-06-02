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

// CM6 (raw/vim mode) rendering of Margin anchor markers (ADR 0008):
//   - the whole `<!--c:ID-->` is always hidden with a zero-width replace (no gap in the prose) —
//     never revealed inline by the cursor,
//   - a line carrying a marker gets a `cm-has-comment` class for a subtle dot cue,
//   - the raw marker is revealed verbatim only behind the "show source" toggle.
// The marker is always preserved verbatim in the buffer — only its rendering changes.

// Hidden marker: a zero-width atomic replacement, so the caret cannot land inside it and nothing
// shows where it sat.
const hiddenMarker = Decoration.replace({});
const commentLine = Decoration.line({ class: "cm-has-comment" });

// Pure over EditorState (whole doc) so it is unit-testable without a live EditorView. Fragments are
// short, so scanning every line is cheap. `showSource` reveals the raw markers verbatim (default off).
export const commentMarkerDecorations = (state: EditorState, showSource = false): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    const matches = [...line.text.matchAll(createCommentMarkerTokenRegex())];
    if (matches.length === 0) continue;

    builder.add(line.from, line.from, commentLine);

    // With "show source" on, leave the raw marker(s) untouched; otherwise hide them all.
    if (showSource) continue;
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
    content: '"●"',
    position: "absolute",
    right: "0.25rem",
    opacity: "0.3",
    fontSize: "0.6em",
    pointerEvents: "none",
  },
});

const makeCommentMarkerPlugin = (showSource: boolean) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = commentMarkerDecorations(view.state, showSource);
      }
      update(update: ViewUpdate) {
        // Recompute on edits (markers appear/move). Cursor moves no longer toggle the rendering.
        if (update.docChanged) {
          this.decorations = commentMarkerDecorations(update.state, showSource);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );

// Factory: the editor recreates the extension when "show source" flips, reconfiguring CM6.
export const commentMarkerExtension = (showSource = false) => [
  makeCommentMarkerPlugin(showSource),
  commentMarkerTheme,
];
