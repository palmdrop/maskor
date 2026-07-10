import { Fragment } from "react";
import { findLinkRanges } from "@lib/document-links/resolver";
import type { SlotLinkApi } from "./slot-editor";

type Props = {
  text: string;
  documentLinks?: SlotLinkApi;
};

// Renders static (non-editing) Margin text — a comment or note body — with its `[[type/key]]` links
// resolved: a resolved link shows its label (alias, else key) styled + click-to-navigate; a broken link
// shows the same label in the broken style, inert. Plain text (and everything when no link surface is
// wired) renders verbatim. Comments are link *readers* only — they never become link-table sources
// (ADR 0007; see specifications/document-links.md). Mirrors the editors' `.doc-link` styling.
export function LinkedText({ text, documentLinks }: Props) {
  if (!documentLinks) {
    return <>{text}</>;
  }
  const ranges = findLinkRanges(text, documentLinks.lookups);
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.from > cursor) {
      nodes.push(<Fragment key={`t-${index}`}>{text.slice(cursor, range.from)}</Fragment>);
    }
    const { resolved } = range;
    if (resolved.uuid && resolved.pathType) {
      const { pathType, uuid } = resolved;
      nodes.push(
        // A resolved link navigates on click. `mousedown`+`stopPropagation` so activating a link never
        // also flips the surrounding comment button into edit mode.
        <button
          key={`l-${index}`}
          type="button"
          className="doc-link"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            documentLinks.navigate(pathType, uuid);
          }}
        >
          {resolved.label}
        </button>,
      );
    } else {
      nodes.push(
        <span key={`b-${index}`} className="doc-link-broken">
          {resolved.label}
        </span>,
      );
    }
    cursor = range.to;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="t-end">{text.slice(cursor)}</Fragment>);
  }
  return <>{nodes}</>;
}
