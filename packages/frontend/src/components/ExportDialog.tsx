import { useState } from "react";
import { toast } from "sonner";
import { useExportSequence, useGetExportAnnotationSummary } from "@api/generated/export/export";
import type { ExportSequenceBody } from "@api/generated/maskorAPI.schemas";
import { useListSequences } from "@api/generated/sequences/sequences";
import { useProjectSetting } from "@hooks/useProjectSetting";
import { ConfirmDialog } from "@components/ui/confirm-dialog";
import { CheckboxField } from "@components/ui/checkbox";
import { Field } from "@components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";

type Format = ExportSequenceBody["format"];
type Separator = NonNullable<ExportSequenceBody["separator"]>;

// Shape of one orphaned-comment warning surfaced on the export response header.
type ExportWarning = { fragmentKey: string; count: number };

// Parse the `X-Maskor-Export-Warnings` response header (URI-encoded JSON). Any
// malformed value degrades to no warnings rather than throwing on a download.
const parseExportWarnings = (headers: Headers): ExportWarning[] => {
  const raw = headers.get("X-Maskor-Export-Warnings");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(parsed) ? (parsed as ExportWarning[]) : [];
  } catch {
    return [];
  }
};

const FORMAT_LABELS: Record<Format, string> = {
  md: "Markdown (.md)",
  txt: "Plain text (.txt)",
  docx: "Word document (.docx)",
};

// Order matches the preview toolbar's separator select; `page-break` is the
// export-only addition (form feed in md/txt, a real page break in docx).
const SEPARATOR_LABELS: Record<Separator, string> = {
  "blank-line": "Blank line",
  "horizontal-rule": "Horizontal rule",
  "page-break": "Page break",
  none: "None",
};

type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  // If provided, the dialog opens with this sequence pre-selected.
  initialSequenceId?: string | null;
};

export const ExportDialog = ({
  open,
  onOpenChange,
  projectId,
  initialSequenceId,
}: ExportDialogProps) => {
  const { data: sequencesBundleEnvelope } = useListSequences(projectId, {
    query: { enabled: open },
  });

  const sequences =
    sequencesBundleEnvelope?.status === 200 ? sequencesBundleEnvelope.data.sequences : [];
  const mainSequence = sequences.find((sequence) => sequence.isMain) ?? null;

  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("md");

  const activeSequenceId = selectedSequenceId ?? initialSequenceId ?? mainSequence?.uuid ?? null;

  // Every export setting owns its read-config → draft → commit lifecycle via
  // `useProjectSetting`. The draft flips the control instantly on change while
  // `commit` persists back to the project config in the background; the export
  // request below rides the current draft values.
  const includeReferences = useProjectSetting(projectId, "export.includeReferences", true);
  const includeMarginAnnotations = useProjectSetting(
    projectId,
    "export.includeMarginAnnotations",
    true,
  );
  const showTitles = useProjectSetting(projectId, "export.showTitles", false);
  const showSectionHeadings = useProjectSetting(projectId, "export.showSectionHeadings", true);
  const separator = useProjectSetting(projectId, "export.separator", "blank-line");

  const handleIncludeReferencesChange = (next: boolean) => {
    includeReferences.setDraft(next);
    includeReferences.commit(next);
  };

  const handleIncludeMarginAnnotationsChange = (next: boolean) => {
    includeMarginAnnotations.setDraft(next);
    includeMarginAnnotations.commit(next);
  };

  const handleShowTitlesChange = (next: boolean) => {
    showTitles.setDraft(next);
    showTitles.commit(next);
  };

  const handleShowSectionHeadingsChange = (next: boolean) => {
    showSectionHeadings.setDraft(next);
    showSectionHeadings.commit(next);
  };

  const handleSeparatorChange = (next: Separator) => {
    separator.setDraft(next);
    separator.commit(next);
  };

  // Preflight annotation counts for the info section below the toggles. The
  // counts are raw (toggle-independent); which lines show follows the drafts.
  const { data: annotationSummaryEnvelope } = useGetExportAnnotationSummary(
    projectId,
    activeSequenceId ?? "",
    { query: { enabled: open && activeSequenceId !== null } },
  );
  const annotationSummary =
    annotationSummaryEnvelope?.status === 200 ? annotationSummaryEnvelope.data : null;

  const mutation = useExportSequence();

  const handleExport = () => {
    if (!activeSequenceId) return;
    mutation.mutate(
      {
        projectId,
        sequenceId: activeSequenceId,
        data: {
          format,
          includeReferences: includeReferences.draft,
          includeMarginAnnotations: includeMarginAnnotations.draft,
          showTitles: showTitles.draft,
          showSectionHeadings: showSectionHeadings.draft,
          separator: separator.draft as Separator,
        },
      },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            const blob = response.data as Blob;
            const fileName = getFileNameFromHeaders(response.headers) ?? `export.${format}`;
            triggerDownload(blob, fileName);
            surfaceExportWarnings(parseExportWarnings(response.headers));
            onOpenChange(false);
            mutation.reset();
          }
        },
      },
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedSequenceId(null);
      mutation.reset();
    }
    onOpenChange(nextOpen);
  };

  // A failed setting persistence is non-fatal (the export still rides the draft),
  // so it surfaces inline under the checkboxes rather than blocking the dialog.
  const settingError =
    includeReferences.error ??
    includeMarginAnnotations.error ??
    showTitles.error ??
    showSectionHeadings.error ??
    separator.error;

  const errorMessage = (() => {
    if (mutation.error) return mutation.error.message;
    const response = mutation.data;
    if (response && response.status !== 200) {
      const body = response.data as { message?: string; error?: string } | undefined;
      return body?.message ?? body?.error ?? "Export failed.";
    }
    return null;
  })();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Export sequence"
      body={
        <div className="flex flex-col gap-4">
          {sequences.length > 1 && (
            <Field label="Sequence">
              {(control) => (
                <Select
                  value={activeSequenceId ?? ""}
                  onValueChange={(value) => setSelectedSequenceId(value)}
                >
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue placeholder="Select sequence…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sequences.map((sequence) => (
                      <SelectItem key={sequence.uuid} value={sequence.uuid}>
                        {sequence.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}

          <Field label="Format">
            {(control) => (
              <Select value={format} onValueChange={(value) => setFormat(value as Format)}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FORMAT_LABELS) as Format[]).map((formatKey) => (
                    <SelectItem key={formatKey} value={formatKey}>
                      {FORMAT_LABELS[formatKey]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label="Separator">
            {(control) => (
              <Select
                value={separator.draft}
                onValueChange={(value) => handleSeparatorChange(value as Separator)}
              >
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SEPARATOR_LABELS) as Separator[]).map((separatorKey) => (
                    <SelectItem key={separatorKey} value={separatorKey}>
                      {SEPARATOR_LABELS[separatorKey]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <div className="flex flex-col gap-2">
            <CheckboxField
              label="Fragment titles"
              checked={showTitles.draft}
              onCheckedChange={(checked) => handleShowTitlesChange(checked === true)}
            />
            <CheckboxField
              label="Section headings"
              checked={showSectionHeadings.draft}
              onCheckedChange={(checked) => handleShowSectionHeadingsChange(checked === true)}
            />
            <CheckboxField
              label="Include references"
              checked={includeReferences.draft}
              onCheckedChange={(checked) => handleIncludeReferencesChange(checked === true)}
            />
            <CheckboxField
              label="Include margin annotations"
              checked={includeMarginAnnotations.draft}
              onCheckedChange={(checked) => handleIncludeMarginAnnotationsChange(checked === true)}
            />
            {settingError && <p className="text-xs text-destructive">{settingError}</p>}
          </div>

          {annotationSummary && (includeReferences.draft || includeMarginAnnotations.draft) && (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex flex-col gap-1">
              {includeReferences.draft && (
                <p>
                  {countLabel(annotationSummary.referenceCount, "reference")} will be added as
                  footnotes.
                </p>
              )}
              {includeMarginAnnotations.draft && (
                <p>
                  {countLabel(annotationSummary.commentCount, "comment")} and{" "}
                  {countLabel(annotationSummary.noteCount, "note")} will be added from the Margin.
                </p>
              )}
              {includeMarginAnnotations.draft && annotationSummary.orphanedCommentCount > 0 && (
                <p className="text-amber-600 dark:text-amber-500">
                  {countLabel(annotationSummary.orphanedCommentCount, "orphaned comment")} will be
                  skipped.
                </p>
              )}
            </div>
          )}
        </div>
      }
      error={errorMessage}
      confirmLabel="Export"
      pendingLabel="Exporting…"
      onConfirm={handleExport}
      isPending={mutation.isPending}
      disabled={!activeSequenceId}
    />
  );
};

// "3 references" / "1 reference" — count plus naively pluralized noun.
const countLabel = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

// Warn (non-fatally — the file already downloaded) that some Margin comments
// could not be placed because their anchors are missing from the fragment body.
const surfaceExportWarnings = (warnings: ExportWarning[]) => {
  if (warnings.length === 0) return;
  const detail = warnings.map((warning) => `${warning.fragmentKey} (${warning.count})`).join(", ");
  toast.warning(`Some orphaned comments were skipped: ${detail}`);
};

const getFileNameFromHeaders = (headers: Headers): string | null => {
  const disposition = headers.get("content-disposition");
  if (!disposition) return null;
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? null;
};

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
