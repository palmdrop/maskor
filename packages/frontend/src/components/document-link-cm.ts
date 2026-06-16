import {
  Decoration,
  type DecorationSet,
  EditorView,
  StateEffect,
  StateField,
  type EditorState,
} from "@uiw/react-codemirror";
import { findLinkRanges, type LinkLookups } from "@lib/document-links/resolver";
import type { LinkPathType } from "@maskor/shared";

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
  const range = findLinkRanges(state.doc.toString(), config.lookups).find(
    (candidate) => pos >= candidate.from && pos <= candidate.to,
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

export const cmDocumentLinkExtension = [cmLinkConfigField, linkDecorations, linkClickHandler, linkTheme];
