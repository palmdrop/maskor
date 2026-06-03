import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildSharedProseExtensions } from "./shared-prose-extensions";

// The `commentMarker` TipTap node no longer lives in the live buffer (ADR 0009) — it is a transient
// parse/serialize vehicle used only on load (markers → anchors) and save (anchors → markers). Its
// markdown round-trip must stay byte-stable for that load/save path to be lossless.

type MarkdownStorage = { markdown: { getMarkdown: () => string } };

const tiptapRoundTrip = (markdown: string): string => {
  const editor = new Editor({ extensions: buildSharedProseExtensions(), content: markdown });
  const out = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
  editor.destroy();
  return out;
};

describe("CommentMarker (TipTap) round-trip", () => {
  it("preserves a trailing marker through markdown -> ProseMirror -> markdown", () => {
    expect(tiptapRoundTrip("The bridge groans. <!--c:abc123-->")).toContain("<!--c:abc123-->");
  });

  it("preserves multiple markers", () => {
    const out = tiptapRoundTrip("One <!--c:aaa-->\n\nTwo <!--c:bbb-->");
    expect(out).toContain("<!--c:aaa-->");
    expect(out).toContain("<!--c:bbb-->");
  });

  it("leaves marker-free prose unchanged in substance", () => {
    expect(tiptapRoundTrip("Just plain prose.")).toContain("Just plain prose.");
  });
});
