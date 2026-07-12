import { markdownToDocx } from "./markdown-to-docx";

export type ExportFormat = "md" | "txt" | "docx";

export type RenderedExport = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
};

// What `renderExport` consumes. A bare string is the md/txt/docx source with no
// annotations. The object form separates the md/txt markdown from the docx-bound
// variant (which retains comment markers) and carries the `{ markerId → body }`
// map the Word-comment lowering needs.
export type ExportRenderInput =
  | string
  | {
      markdown: string;
      docxMarkdown?: string;
      commentBodies?: Record<string, string>;
    };

/**
 * Render an assembled markdown source to the target format.
 * `md` and `txt` are UTF-8 bytes of `markdown` (byte-identical output, different
 * extension). `docx` converts the docx-bound variant via the mdast-based Word
 * builder, lowering footnotes and (from `commentBodies`) Word comments.
 */
export const renderExport = async (
  input: ExportRenderInput,
  format: ExportFormat,
): Promise<RenderedExport> => {
  const source = typeof input === "string" ? { markdown: input } : input;

  switch (format) {
    case "md":
      return {
        bytes: new TextEncoder().encode(source.markdown),
        mimeType: "text/markdown",
        extension: "md",
      };

    case "txt":
      return {
        bytes: new TextEncoder().encode(source.markdown),
        mimeType: "text/plain",
        extension: "txt",
      };

    case "docx": {
      const bytes = await markdownToDocx(source.docxMarkdown ?? source.markdown, {
        commentBodies: source.commentBodies,
      });
      return {
        bytes,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: "docx",
      };
    }
  }
};
