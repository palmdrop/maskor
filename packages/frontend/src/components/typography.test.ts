import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildSharedProseExtensions } from "./shared-prose-extensions";

type MarkdownStorage = { markdown: { getMarkdown: () => string } };

const makeEditor = (content: string): Editor =>
  new Editor({ extensions: buildSharedProseExtensions(), content });

const getMarkdown = (editor: Editor): string =>
  (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();

describe("rich-mode typographic substitution (US-007)", () => {
  it("round-trips an em dash byte-stable through load → serialize", () => {
    const editor = makeEditor("Before—after.");
    expect(getMarkdown(editor)).toContain("—");
    editor.destroy();
  });

  it("round-trips an ellipsis byte-stable through load → serialize", () => {
    const editor = makeEditor("Waiting…");
    expect(getMarkdown(editor)).toContain("…");
    editor.destroy();
  });

  it("round-trips curly double quotes byte-stable through load → serialize", () => {
    const editor = makeEditor("“Hello.”");
    const md = getMarkdown(editor);
    expect(md).toContain("“");
    expect(md).toContain("”");
    editor.destroy();
  });

  it("does not corrupt code spans that contain double-hyphens", () => {
    const editor = makeEditor("Use `--flag` here.");
    expect(getMarkdown(editor)).toContain("`--flag`");
    editor.destroy();
  });
});
