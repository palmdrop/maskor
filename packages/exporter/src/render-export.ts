import { markdownToDocx } from "./markdown-to-docx";

export type ExportFormat = "md" | "txt" | "docx";

export type RenderedExport = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
};

/**
 * Render an assembled markdown string to the target format.
 * `md` and `txt` are UTF-8 bytes of the string (byte-identical output, different extension).
 * `docx` converts via the mdast-based Word builder.
 */
export const renderExport = async (
  markdown: string,
  format: ExportFormat,
): Promise<RenderedExport> => {
  switch (format) {
    case "md":
      return {
        bytes: new TextEncoder().encode(markdown),
        mimeType: "text/markdown",
        extension: "md",
      };

    case "txt":
      return {
        bytes: new TextEncoder().encode(markdown),
        mimeType: "text/plain",
        extension: "txt",
      };

    case "docx": {
      const bytes = await markdownToDocx(markdown);
      return {
        bytes,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: "docx",
      };
    }
  }
};
