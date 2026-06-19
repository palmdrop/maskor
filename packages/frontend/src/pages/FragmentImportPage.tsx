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
  ImportPreviewResult,
  PreviewNavFragment,
  ImportResult,
} from "@api/generated/maskorAPI.schemas";
import { AlertTriangleIcon } from "lucide-react";
import { useProjectEditorConfig } from "@hooks/useProjectEditorConfig";
import { useFragmentAnchor } from "@hooks/useFragmentAnchor";
import { useScrollSpy } from "@hooks/useScrollSpy";
import { ReadonlyProse } from "@components/readonly-prose";
import { FragmentNavSidebar } from "@components/FragmentNavSidebar";
import { ActiveFragmentLabel } from "@components/active-fragment-label";
import { Button } from "@components/ui/button";
import { useCommands } from "@lib/commands/useCommands";
import { useCommandScope } from "@lib/commands/useCommandScope";
import { fragmentImportScope } from "@lib/commands/scopes/fragment-import";
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

function formatContextLabel(format: Format, headingLevel: HeadingLevel, delimiter: string): string {
  if (format === "markdown") return `Format: markdown · split on H${headingLevel}`;
  if (format === "docx") return `Format: docx · split on H${headingLevel}`;
  return `Format: plaintext · split on \`${delimiter}\``;
}

// Serialize the import options exactly as the preview and commit endpoints expect:
// plaintext splits on a delimiter, the heading formats split on a heading level.
function buildImportOptions(format: Format, headingLevel: HeadingLevel, delimiter: string): string {
  return format === "plaintext"
    ? JSON.stringify({ format, delimiter })
    : JSON.stringify({ format, headingLevel: Number(headingLevel) });
}

// The nav fragment uuid is the piece index (as a string); the assembled markdown
// carries an anchor rendering id="fragment-<index>" for each piece.
function pieceLabel(fragment: PreviewNavFragment) {
  return `${fragment.uuid}. ${fragment.key}`;
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
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [partialFailureResult, setPartialFailureResult] = useState<ImportResult | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement>(null);

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
      const options = buildImportOptions(currentFormat, currentHeadingLevel, currentDelimiter);
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

    const options = buildImportOptions(format, headingLevel, delimiter);

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

  const pieces: PreviewNavFragment[] =
    previewResult?.sections.flatMap((section) => section.fragments) ?? [];
  const priorImport = previewResult?.priorImport ?? null;
  const isInFlight = isPreviewPending || isCommitPending;
  const pieceCount = pieces.length;

  const { navigateToAnchor } = useFragmentAnchor({ ready: pieceCount > 0 });

  // Highlight the piece at the reading line as the preview scrolls (matching the
  // preview page), recomputing when the split changes the rendered pieces.
  const activeFragmentId = useScrollSpy({
    rootRef: mainRef,
    enabled: pieceCount > 0,
    deps: [previewResult],
  });

  const commands = useCommands();
  useCommandScope(fragmentImportScope, {
    canImport: pieceCount > 0 && !isInFlight,
    import: () => void handleImport(),
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

  const showHeadingLevel = format === "markdown" || format === "docx";
  const showDelimiter = format === "plaintext";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-10 flex items-center gap-4 shrink-0 border-b border-border bg-background px-4 py-2">
        <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
        <span className="text-sm text-muted-foreground shrink-0">
          {formatContextLabel(format, headingLevel, delimiter)}
        </span>
        <ActiveFragmentLabel
          fragmentKey={
            activeFragmentId
              ? pieces.find((piece) => piece.uuid === activeFragmentId)?.key
              : undefined
          }
        />
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

      {/* Re-import warning — advisory, does not block Import */}
      {priorImport && (
        <div
          role="status"
          className="flex items-start gap-2 shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            You already imported a file named <span className="font-medium">{file.name}</span> on{" "}
            {new Date(priorImport.importedAt).toLocaleDateString()} (sequence “
            {priorImport.sequenceName}”). Importing again creates a new, separate import-sequence.
          </span>
        </div>
      )}

      {/* Body: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <FragmentNavSidebar
          className="w-72"
          sections={previewResult?.sections ?? []}
          getFragmentLabel={pieceLabel}
          activeAnchorId={activeFragmentId}
          onSelect={navigateToAnchor}
          header={
            <div className="px-4 pt-4 pb-2 text-sm font-medium">
              {pieceCount === 0
                ? "No fragments"
                : `${pieceCount} fragment${pieceCount !== 1 ? "s" : ""} will be created`}
            </div>
          }
        />

        {/* Main content area */}
        <main
          ref={mainRef}
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
            <ReadonlyProse
              content={previewResult?.markdown ?? ""}
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
