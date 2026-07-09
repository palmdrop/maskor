import { describe, it, expect, vi } from "vitest";
import { EditorState, EditorSelection, EditorView } from "@uiw/react-codemirror";
import {
  startCompletion,
  completionStatus,
  currentCompletions,
  type Completion,
} from "@codemirror/autocomplete";
import {
  cmLinkConfigField,
  setCmLinkConfigEffect,
  cmDocumentLinkExtension,
  navigateDocumentLinkAtCursor,
  acceptCompletionOnTab,
  type CmLinkConfig,
} from "./document-link-cm";
import { EMPTY_LINK_LOOKUPS } from "@lib/document-links/resolver";

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

describe("acceptCompletionOnTab", () => {
  const linkConfig: CmLinkConfig = {
    lookups: { ...EMPTY_LINK_LOOKUPS, fragments: new Map([["chapter-1", "frag-uuid"]]) },
    navigate: vi.fn(),
  };

  // A live EditorView is required — completion status lives in the autocompletion plugin's view state.
  const mountView = (doc: string, cursor: number): EditorView => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        extensions: [cmDocumentLinkExtension],
      }),
      parent,
    });
    view.dispatch({ effects: setCmLinkConfigEffect.of(linkConfig) });
    return view;
  };

  it("opens the acceptance gate once the `[[` popup is active", async () => {
    const view = mountView("see [[chapter", 13); // caret right after the typed query

    // Before the popup opens the gate is closed — Tab must fall through to the editor.
    expect(acceptCompletionOnTab(view)).toBe(false);

    startCompletion(view);
    // The completion source resolves asynchronously; the gate opens once the popup is active.
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"));

    // The single offered completion, when applied, rewrites the open `[[chapter` to the canonical
    // full-path link — the acceptance Tab now triggers. (acceptCompletion reads the highlighted option
    // from the rendered tooltip, which jsdom does not lay out, so drive the option's `apply` directly.)
    const [completion] = currentCompletions(view.state) as [Completion];
    expect(completion.label).toBe("fragments/chapter-1");
    const applyCompletion = completion.apply as (
      view: EditorView,
      completion: Completion,
      from: number,
      to: number,
    ) => void;
    applyCompletion(view, completion, 6, 13); // from after `[[`, to the caret
    expect(view.state.doc.toString()).toBe("see [[fragments/chapter-1]]");
    view.destroy();
  });

  it("does nothing (Tab falls through) when no completion popup is open", () => {
    const view = mountView("plain text", 5);
    // Gated out before touching the buffer — Tab keeps its normal editor behaviour.
    expect(acceptCompletionOnTab(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("plain text");
    view.destroy();
  });
});
