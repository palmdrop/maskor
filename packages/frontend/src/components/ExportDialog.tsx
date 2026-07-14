import { useState } from "react";
import { toast } from "sonner";
import { useExportSequence } from "@api/generated/export/export";
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

  // Annotation toggles own their read-config → draft → commit lifecycle via
  // `useProjectSetting`. The draft flips the checkbox instantly on click while
  // `commit` persists back to the project config in the background; the export
  // request below rides the current draft values.
  const includeReferences = useProjectSetting(projectId, "export.includeReferences", true);
  const includeMarginAnnotations = useProjectSetting(
    projectId,
    "export.includeMarginAnnotations",
    true,
  );

  const handleIncludeReferencesChange = (next: boolean) => {
    includeReferences.setDraft(next);
    includeReferences.commit(next);
  };

  const handleIncludeMarginAnnotationsChange = (next: boolean) => {
    includeMarginAnnotations.setDraft(next);
    includeMarginAnnotations.commit(next);
  };

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

  // A failed toggle persistence is non-fatal (the export still rides the draft),
  // so it surfaces inline under the checkboxes rather than blocking the dialog.
  const settingError = includeReferences.error ?? includeMarginAnnotations.error;

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

          <div className="flex flex-col gap-2">
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
