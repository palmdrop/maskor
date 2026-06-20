import { describe, it, expect, vi } from "vitest";
import { EditorState, EditorSelection, type EditorView } from "@uiw/react-codemirror";
import {
  cmLinkConfigField,
  setCmLinkConfigEffect,
  navigateDocumentLinkAtCursor,
  hasAutoClosedBrackets,
  type CmLinkConfig,
} from "./document-link-cm";
import { EMPTY_LINK_LOOKUPS } from "@lib/document-links/resolver";

describe("hasAutoClosedBrackets", () => {
  it("detects a closeBrackets-inserted `]]` right after the cursor", () => {
    expect(hasAutoClosedBrackets("]]")).toBe(true);
    expect(hasAutoClosedBrackets("]] more")).toBe(true);
  });

  it("is false when no closing brackets follow", () => {
    expect(hasAutoClosedBrackets("")).toBe(false);
    expect(hasAutoClosedBrackets("] ")).toBe(false);
    expect(hasAutoClosedBrackets(" text")).toBe(false);
  });
});

describe("navigateDocumentLinkAtCursor", () => {
  const config = (navigate: CmLinkConfig["navigate"]): CmLinkConfig => ({
    lookups: { ...EMPTY_LINK_LOOKUPS, fragments: new Map([["chapter-1", "frag-uuid"]]) },
    navigate,
  });

  // Build a headless state carrying the link config field, the doc, and a caret at `cursor`.
  const stateAt = (cursor: number, navigate: CmLinkConfig["navigate"]) => {
    const base = EditorState.create({
      doc: "see [[fragments/chapter-1]] end",
      selection: EditorSelection.cursor(cursor),
      extensions: [cmLinkConfigField],
    });
    return base.update({ effects: setCmLinkConfigEffect.of(config(navigate)) }).state;
  };

  it("navigates the resolved link the caret sits in", () => {
    const navigate = vi.fn();
    const state = stateAt(10, navigate); // inside `[[fragments/chapter-1]]` (offsets 4..27)
    const handled = navigateDocumentLinkAtCursor({ state } as unknown as EditorView);
    expect(handled).toBe(true);
    expect(navigate).toHaveBeenCalledWith("fragments", "frag-uuid");
  });

  it("does nothing when the caret is not inside a link", () => {
    const navigate = vi.fn();
    const state = stateAt(1, navigate); // inside "see"
    const handled = navigateDocumentLinkAtCursor({ state } as unknown as EditorView);
    expect(handled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
