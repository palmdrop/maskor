import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import Typography from "@tiptap/extension-typography";
import { Loader2Icon } from "lucide-react";
import { usePreviewImportFragments } from "@api/generated/fragments/fragments";
import type { PreviewImportResult, PreviewPiece } from "@api/generated/maskorAPI.schemas";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";

type HeadingLevel = "1" | "2" | "3" | "4" | "5" | "6";
type Format = "markdown" | "docx" | "plaintext";

function formatFromExtension(filename: string): Format | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "md") return "markdown";
  if (extension === "docx") return "docx";
  if (extension === "txt") return "plaintext";
  return null;
}

function buildPreviewMarkdown(pieces: PreviewPiece[]): string {
  if (pieces.length === 0) return "";
  return pieces
    .map((piece) => `**Piece ${piece.pieceIndex} · ${piece.derivedKey}**\n\n${piece.content}`)
    .join("\n\n---\n\n");
}

function formatContextLabel(format: Format, headingLevel: HeadingLevel, delimiter: string): string {
  if (format === "markdown") return `Format: markdown · split on H${headingLevel}`;
  if (format === "docx") return `Format: docx · split on H${headingLevel}`;
  return `Format: plaintext · split on \`${delimiter}\``;
}

type RouterState = {
  file?: File;
};

type ReadonlyEditorProps = {
  content: string;
};

const ReadonlyEditor = ({ content }: ReadonlyEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, transformPastedText: true }),
      Typography,
    ],
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-stone dark:prose-invert max-w-none px-1 py-2",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content);
  }, [content, editor]);

  return <EditorContent editor={editor} />;
};

export const FragmentImportPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/fragments/import" });
  const navigate = useNavigate();
  const routerState = useRouterState({ select: (s) => s.location.state as RouterState });
  const file = routerState?.file ?? null;

  const [headingLevel, setHeadingLevel] = useState<HeadingLevel>("1");
  const [delimiter, setDelimiter] = useState("---");
  const [previewResult, setPreviewResult] = useState<PreviewImportResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const format: Format | null = file ? formatFromExtension(file.name) : null;

  const { mutateAsync: previewImport, isPending: isPreviewPending } = usePreviewImportFragments();

  // Redirect if no file in state or unsupported extension
  useEffect(() => {
    if (!file || !format) {
      void navigate({
        to: "/projects/$projectId/fragments",
        params: { projectId },
      });
    }
  }, [file, format, navigate, projectId]);

  const runPreview = useCallback(
    async (currentFile: File, currentFormat: Format, currentHeadingLevel: HeadingLevel, currentDelimiter: string) => {
      setPreviewError(null);
      let options: string;
      if (currentFormat === "plaintext") {
        options = JSON.stringify({ format: currentFormat, delimiter: currentDelimiter });
      } else {
        options = JSON.stringify({ format: currentFormat, headingLevel: Number(currentHeadingLevel) });
      }
      try {
        const response = await previewImport({
          projectId,
          data: { file: currentFile, options },
        });
        if (response.status === 200) {
          setPreviewResult(response.data);
        } else {
          setPreviewError("Preview failed. Please try again.");
        }
      } catch {
        setPreviewError("Network error. Please try again.");
      }
    },
    [previewImport, projectId],
  );

  // Initial preview on mount
  useEffect(() => {
    if (file && format) {
      void runPreview(file, format, headingLevel, delimiter);
    }
    // Only run on mount — options changes use the debounced path below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced preview on options change
  useEffect(() => {
    if (!file || !format) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void runPreview(file, format, headingLevel, delimiter);
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // Intentionally depend on headingLevel and delimiter changes only after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headingLevel, delimiter]);

  const scrollToPiece = (pieceIndex: number) => {
    if (!mainAreaRef.current) return;
    const elements = mainAreaRef.current.querySelectorAll("strong");
    for (const element of elements) {
      if (element.textContent?.startsWith(`Piece ${pieceIndex} ·`)) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  };

  if (!file || !format) return null;

  const pieces = previewResult?.pieces ?? [];
  const pieceCount = pieces.length;
  const showHeadingLevel = format === "markdown" || format === "docx";
  const showDelimiter = format === "plaintext";
  const previewMarkdown = buildPreviewMarkdown(pieces);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-10 flex items-center gap-4 shrink-0 border-b border-border bg-background px-4 py-2">
        <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
        <span className="text-sm text-muted-foreground shrink-0">
          {formatContextLabel(format, headingLevel, delimiter)}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {showHeadingLevel && (
            <div className="flex items-center gap-1.5">
              <Label className="text-xs shrink-0">Split on</Label>
              <Select
                value={headingLevel}
                onValueChange={(value) => setHeadingLevel(value as HeadingLevel)}
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">H1 only</SelectItem>
                  <SelectItem value="2">H1 and H2</SelectItem>
                  <SelectItem value="3">H1 through H3</SelectItem>
                  <SelectItem value="4">H1 through H4</SelectItem>
                  <SelectItem value="5">H1 through H5</SelectItem>
                  <SelectItem value="6">H1 through H6</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {showDelimiter && (
            <div className="flex items-center gap-1.5">
              <Label className="text-xs shrink-0">Delimiter</Label>
              <Input
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="h-7 text-xs w-24"
                placeholder="e.g. ---"
              />
            </div>
          )}
          {isPreviewPending && <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="flex flex-col gap-3 w-72 shrink-0 border-r border-border p-4 overflow-y-auto">
          <div className="text-sm font-medium">
            {pieceCount === 0 ? "No pieces" : `${pieceCount} piece${pieceCount !== 1 ? "s" : ""} will be created`}
          </div>
          {pieceCount > 0 && (
            <ul className="flex flex-col gap-1">
              {pieces.map((piece) => (
                <li key={piece.pieceIndex}>
                  <button
                    type="button"
                    className="text-left w-full text-sm px-2 py-1 rounded hover:bg-muted truncate"
                    onClick={() => scrollToPiece(piece.pieceIndex)}
                  >
                    {piece.pieceIndex}. {piece.derivedKey}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main content area */}
        <main
          ref={mainAreaRef}
          className={[
            "flex-1 min-h-0 overflow-y-auto p-6",
            isPreviewPending ? "opacity-60" : "",
          ].join(" ").trim()}
        >
          {previewError ? (
            <div className="text-sm text-destructive">
              <p className="font-medium">Preview failed</p>
              <p>{previewError}</p>
            </div>
          ) : pieceCount === 0 && !isPreviewPending ? (
            <p className="text-sm text-muted-foreground">
              {format === "plaintext"
                ? "Delimiter not found in the file."
                : "No pieces matched. Try a different heading level."}
            </p>
          ) : (
            <ReadonlyEditor content={previewMarkdown} />
          )}
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="sticky bottom-0 shrink-0 border-t border-border bg-background px-4 py-3 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() =>
            navigate({
              to: "/projects/$projectId/fragments",
              params: { projectId },
            })
          }
        >
          Cancel
        </Button>
        <Button disabled={pieceCount === 0 || isPreviewPending}>
          {isPreviewPending ? (
            <>
              <Loader2Icon className="animate-spin" />
              Loading…
            </>
          ) : (
            `Import ${pieceCount} fragment${pieceCount !== 1 ? "s" : ""}`
          )}
        </Button>
      </footer>
    </div>
  );
};
