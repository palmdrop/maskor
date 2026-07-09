import {
  Decoration,
  type DecorationSet,
  EditorView,
  StateEffect,
  StateField,
  keymap,
  Prec,
  type EditorState,
} from "@uiw/react-codemirror";
import {
  autocompletion,
  acceptCompletion,
  completionStatus,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { findLinkRanges, trailingLinkSpan, type LinkLookups } from "@lib/document-links/resolver";
import type { LinkPathType } from "@maskor/shared";

const PATH_TYPES: LinkPathType[] = ["fragments", "notes", "references", "aspects"];

// Document-link rendering for the raw/vim (CM6) editor: a mark decoration styles every `[[type/key]]`
// occurrence (resolved vs broken) and a click on a resolved link navigates to its target (the vim
// `gd` motion and `Mod-Enter` do the same from the caret). The link text stays in the buffer verbatim
// (unlike comment anchors) — links are user-visible, Obsidian-compatible content.

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

// A plain click on a resolved link navigates (matching rich mode; broken links fall through so they
// stay editable). High precedence so it runs before vim's own mouse handling. Uses `click` rather than
// `mousedown` so a text-selection drag that begins on a link isn't hijacked.
const linkClickHandler = Prec.high(
  EditorView.domEventHandlers({
    click(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const hit = linkAt(view.state, pos);
      if (!hit) return false;
      event.preventDefault();
      hit.config.navigate(hit.pathType, hit.uuid);
      return true;
    },
  }),
);

// Navigate the resolved link the caret sits in (vim `gd` + the `Mod-Enter` keymap below). Returns
// false when the caret is not inside a resolved link, so the key falls through to its default.
export const navigateDocumentLinkAtCursor = (view: EditorView): boolean => {
  const hit = linkAt(view.state, view.state.selection.main.head);
  if (!hit) return false;
  hit.config.navigate(hit.pathType, hit.uuid);
  return true;
};

// Accept the highlighted `[[` completion with Tab, but only while the completion popup is open —
// `completionStatus === "active"` gates it so Tab keeps its normal behaviour (indent, vim, next slot)
// everywhere else. High precedence so it runs before the editor's own Tab handling when the popup is up.
export const acceptCompletionOnTab = (view: EditorView): boolean => {
  if (completionStatus(view.state) !== "active") return false;
  return acceptCompletion(view);
};

const linkKeymap = Prec.high(
  keymap.of([
    { key: "Mod-Enter", run: (view) => navigateDocumentLinkAtCursor(view) },
    { key: "Tab", run: acceptCompletionOnTab },
  ]),
);

const linkTheme = EditorView.baseTheme({
  ".cm-doc-link": {
    color: "var(--color-primary, #2563eb)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
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
      // Insert `type/key]]` after the existing `[[`, replacing through any closing `]]` already present
      // — closeBrackets' auto-inserted `]]`, or the tail of a link being edited — so we never produce
      // `[[type/key]]]]` and editing an existing link rewrites it cleanly.
      apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
        const insert = `${pathType}/${key}]]`;
        const span = trailingLinkSpan(view.state.sliceDoc(to, view.state.doc.lineAt(to).to));
        view.dispatch({
          changes: { from, to: to + span, insert },
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
