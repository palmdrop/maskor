import {
  Decoration,
  type DecorationSet,
  EditorView,
  StateEffect,
  StateField,
  keymap,
  type EditorState,
} from "@uiw/react-codemirror";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { findLinkRanges, type LinkLookups } from "@lib/document-links/resolver";
import type { LinkPathType } from "@maskor/shared";

const PATH_TYPES: LinkPathType[] = ["fragments", "notes", "references", "aspects"];

// Document-link rendering for the raw/vim (CM6) editor: a mark decoration styles every `[[type/key]]`
// occurrence (resolved vs broken) and Cmd/Ctrl-click on a resolved link navigates to its target. The
// link text stays in the buffer verbatim (unlike comment anchors) — links are user-visible,
// Obsidian-compatible content.

export type CmLinkConfig = {
  lookups: LinkLookups;
  navigate: (pathType: LinkPathType, uuid: string) => void;
};

export const setCmLinkConfigEffect = StateEffect.define<CmLinkConfig>();

export const cmLinkConfigField = StateField.define<CmLinkConfig | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setCmLinkConfigEffect)) return effect.value;
    }
    return value;
  },
});

// True when a closing `]]` (auto-inserted by CodeMirror's closeBrackets the moment the user typed
// `[[`) sits immediately after the completion range and must be swallowed — otherwise completing the
// link yields `[[type/key]]]]`.
export const hasAutoClosedBrackets = (textAfterCursor: string): boolean =>
  textAfterCursor.startsWith("]]");

const resolvedMark = Decoration.mark({ class: "cm-doc-link" });
const brokenMark = Decoration.mark({ class: "cm-doc-link-broken" });

export const buildLinkDecorations = (state: EditorState): DecorationSet => {
  const config = state.field(cmLinkConfigField);
  if (!config) return Decoration.none;
  const ranges = findLinkRanges(state.doc.toString(), config.lookups).map((range) =>
    (range.resolved.uuid ? resolvedMark : brokenMark).range(range.from, range.to),
  );
  return Decoration.set(ranges, true);
};

const linkDecorations = EditorView.decorations.compute(
  ["doc", cmLinkConfigField],
  buildLinkDecorations,
);

// Resolve which link (if any) the document offset falls within, for click navigation.
const linkAt = (state: EditorState, pos: number) => {
  const config = state.field(cmLinkConfigField);
  if (!config) return null;
  // Half-open [from, to): a click exactly at `to` belongs to whatever follows (e.g. an adjacent
  // link), never to this one — matches the decorated range so only styled text is clickable.
  const range = findLinkRanges(state.doc.toString(), config.lookups).find(
    (candidate) => pos >= candidate.from && pos < candidate.to,
  );
  if (!range || !range.resolved.uuid || range.resolved.pathType === null) return null;
  return { pathType: range.resolved.pathType, uuid: range.resolved.uuid, config };
};

const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const hit = linkAt(view.state, pos);
    if (!hit) return false;
    event.preventDefault();
    hit.config.navigate(hit.pathType, hit.uuid);
    return true;
  },
});

// Navigate the resolved link the caret sits in (vim `gd` + the `Mod-Enter` keymap below). Returns
// false when the caret is not inside a resolved link, so the key falls through to its default.
export const navigateDocumentLinkAtCursor = (view: EditorView): boolean => {
  const hit = linkAt(view.state, view.state.selection.main.head);
  if (!hit) return false;
  hit.config.navigate(hit.pathType, hit.uuid);
  return true;
};

const linkKeymap = keymap.of([
  { key: "Mod-Enter", run: (view) => navigateDocumentLinkAtCursor(view) },
]);

const linkTheme = EditorView.baseTheme({
  ".cm-doc-link": {
    color: "var(--color-primary, #2563eb)",
    cursor: "pointer",
  },
  ".cm-doc-link-broken": {
    color: "var(--color-destructive, #dc2626)",
    textDecoration: "underline dotted",
  },
});

// `[[` autocomplete: when the caret follows an open `[[…` (no closing `]]` yet), offer every linkable
// entity. Selecting one completes the canonical `[[type/key]]`.
const linkCompletionSource = (context: CompletionContext): CompletionResult | null => {
  const config = context.state.field(cmLinkConfigField, false);
  if (!config) return null;
  // Matches an open `[[` plus any query typed so far (zero-width query is fine — fires right at `[[`).
  const before = context.matchBefore(/\[\[[^[\]\n]*/);
  if (!before) return null;
  const options = PATH_TYPES.flatMap((pathType) =>
    [...config.lookups[pathType].keys()].map((key) => ({
      label: `${pathType}/${key}`,
      type: "link",
      // Insert `type/key]]` after the existing `[[`, and swallow a closing `]]` that CodeMirror's
      // closeBrackets auto-inserted when the user typed `[[` — otherwise the result is `[[type/key]]]]`.
      apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
        const insert = `${pathType}/${key}]]`;
        const trailing = hasAutoClosedBrackets(view.state.sliceDoc(to, to + 2)) ? 2 : 0;
        view.dispatch({
          changes: { from, to: to + trailing, insert },
          selection: { anchor: from + insert.length },
        });
      },
    })),
  );
  // `from` after the `[[` so the typed query (not the brackets) drives filtering against the labels.
  return { from: before.from + 2, options, filter: true };
};

export const cmDocumentLinkExtension = [
  cmLinkConfigField,
  linkDecorations,
  linkClickHandler,
  linkKeymap,
  linkTheme,
  autocompletion({ override: [linkCompletionSource] }),
];
