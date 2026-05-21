import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import {
  usePreviewImportFragments,
  useImportFragments,
  getListFragmentsQueryKey,
} from "@api/generated/fragments/fragments";
import type {
  PreviewImportResult,
  PreviewPiece,
  ImportResult,
} from "@api/generated/maskorAPI.schemas";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { ReadonlyEditor } from "@components/readonly-editor";
import { Button } from "@components/ui/button";
import { useCommands } from "@lib/commands/useCommands";
import { useFragmentImportCommands } from "@lib/commands/catalog/useFragmentImportCommands";
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
    .map((piece) => `**${piece.pieceIndex}. ${piece.derivedKey}**\n\n${piece.content}`)
    .join("\n\n---\n\n");
}

function formatContextLabel(format: Format, headingLevel: HeadingLevel, delimiter: string): string {
  if (format === "markdown") return `Format: markdown · split on H${headingLevel}`;
  if (format === "docx") return `Format: docx · split on H${headingLevel}`;
  return `Format: plaintext · split on \`${delimiter}\``;
}

function getPieceAnchor(piece: PreviewPiece) {
  return `${piece.pieceIndex}. ${piece.derivedKey}`;
}

type RouterState = {
  file?: File;
};

export const FragmentImportPage = () => {
  const { projectId } = useParams({ from: "/projects/$projectId/fragments/import" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { fontSize, maxParagraphWidth } = useProjectEditorConfig(projectId);
  const routerState = useRouterState({ select: (s) => s.location.state as RouterState });
  const file = routerState?.file ?? null;

  const [headingLevel, setHeadingLevel] = useState<HeadingLevel>("1");
  const [delimiter, setDelimiter] = useState("---");
  const [previewResult, setPreviewResult] = useState<PreviewImportResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [partialFailureResult, setPartialFailureResult] = useState<ImportResult | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const format: Format | null = file ? formatFromExtension(file.name) : null;

  const { mutateAsync: previewImport, isPending: isPreviewPending } = usePreviewImportFragments();
  const { mutateAsync: importFragments, isPending: isCommitPending } = useImportFragments();

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
    async (
      currentFile: File,
      currentFormat: Format,
      currentHeadingLevel: HeadingLevel,
      currentDelimiter: string,
    ) => {
      setPreviewError(null);
      let options: string;
      if (currentFormat === "plaintext") {
        options = JSON.stringify({ format: currentFormat, delimiter: currentDelimiter });
      } else {
        options = JSON.stringify({
          format: currentFormat,
          headingLevel: Number(currentHeadingLevel),
        });
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
  }, [headingLevel, delimiter]);

  const handleImport = async () => {
    if (!file || !format) return;
    setCommitError(null);

    let options: string;
    if (format === "plaintext") {
      options = JSON.stringify({ format, delimiter });
    } else {
      options = JSON.stringify({ format, headingLevel: Number(headingLevel) });
    }

    try {
      const response = await importFragments({ projectId, data: { file, options } });

      if (response.status === 200) {
        await queryClient.invalidateQueries({ queryKey: getListFragmentsQueryKey(projectId) });

        if (response.data.errors.length === 0) {
          void navigate({ to: "/projects/$projectId/fragments", params: { projectId } });
        } else {
          setPartialFailureResult(response.data);
        }
      } else {
        setCommitError("Import failed. Please try again.");
      }
    } catch {
      setCommitError("Network error. Please try again.");
    }
  };

  // TODO: I do not like this at all. Use proper anchor tags instead
  const scrollToPiece = (piece: PreviewPiece) => {
    if (!mainAreaRef.current) return;
    const elements = mainAreaRef.current.querySelectorAll("strong");
    for (const element of elements) {
      if (element.textContent?.startsWith(getPieceAnchor(piece))) {
        element.scrollIntoView({ behavior: "instant", block: "start" });
        return;
      }
    }
  };

  const isInFlight = isPreviewPending || isCommitPending;
  const pieceCount = previewResult?.pieces?.length ?? 0;

  const commands = useCommands();
  useFragmentImportCommands({
    canImport: pieceCount > 0 && !isInFlight,
    onImport: () => void handleImport(),
  });

  if (!file || !format) return null;

  // Partial failure state — replace page body
  if (partialFailureResult) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center p-8">
        <div className="max-w-lg w-full border border-border rounded-lg p-6 flex flex-col gap-4">
          <h2 className="text-base font-medium">
            Created {partialFailureResult.created.length}, Failed{" "}
            {partialFailureResult.errors.length}
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {partialFailureResult.errors.map((err) => (
              <li key={err.pieceIndex} className="text-destructive">
                <span className="font-medium">{err.pieceIndex}.</span>
                {err.pieceKey && (
                  <span className="text-muted-foreground ml-1">({err.pieceKey})</span>
                )}
                <span className="ml-1">— {err.error}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() =>
                void navigate({ to: "/projects/$projectId/fragments", params: { projectId } })
              }
            >
              Return to fragment list
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void navigate({ to: "/projects/$projectId/fragments", params: { projectId } })
              }
            >
              Discard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const pieces = previewResult?.pieces ?? [];
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
                disabled={isCommitPending}
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
                disabled={isCommitPending}
              />
            </div>
          )}
          {isPreviewPending && (
            <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="flex flex-col gap-3 w-72 shrink-0 border-r border-border p-4 overflow-y-auto">
          <div className="text-sm font-medium">
            {pieceCount === 0
              ? "No fragments"
              : `${pieceCount} fragment${pieceCount !== 1 ? "s" : ""} will be created`}
          </div>
          {pieceCount > 0 && (
            <ul className="flex flex-col gap-1">
              {pieces.map((piece) => (
                <li key={piece.pieceIndex}>
                  <button
                    type="button"
                    className="text-left w-full text-sm px-2 py-1 rounded hover:bg-muted truncate"
                    onClick={() => scrollToPiece(piece)}
                  >
                    {getPieceAnchor(piece)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main content area */}
        <main
          ref={mainAreaRef}
          className={["flex-1 min-h-0 overflow-y-auto p-6", isPreviewPending ? "opacity-60" : ""]
            .join(" ")
            .trim()}
        >
          {previewError ? (
            <div className="text-sm text-destructive">
              <p className="font-medium">Preview failed</p>
              <p>{previewError}</p>
            </div>
          ) : isPreviewPending && !previewResult ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2Icon className="h-6 w-6 animate-spin" />
              <p className="text-sm">Converting…</p>
            </div>
          ) : pieceCount === 0 && !isPreviewPending ? (
            <p className="text-sm text-muted-foreground">
              {format === "plaintext"
                ? "Delimiter not found in the file."
                : "No fragments matched. Try a different heading level."}
            </p>
          ) : (
            <ReadonlyEditor
              content={previewMarkdown}
              fontSize={fontSize}
              maxParagraphWidth={maxParagraphWidth}
            />
          )}
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="sticky bottom-0 shrink-0 border-t border-border bg-background px-4 py-3 flex items-center justify-end gap-2">
        {commitError && <p className="text-xs text-destructive mr-auto">{commitError}</p>}
        <Button
          variant="outline"
          onClick={() =>
            void navigate({
              to: "/projects/$projectId/fragments",
              params: { projectId },
            })
          }
        >
          Cancel
        </Button>
        <Button
          disabled={pieceCount === 0 || isInFlight}
          onClick={() => commands.run("fragment-import:import")}
        >
          {isCommitPending ? (
            <>
              <Loader2Icon className="animate-spin" />
              Importing…
            </>
          ) : isPreviewPending ? (
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
