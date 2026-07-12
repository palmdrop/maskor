import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useExportSequence } from "@api/generated/export/export";
import type { ExportSequenceBody, ProjectUpdate } from "@api/generated/maskorAPI.schemas";
import { useListSequences } from "@api/generated/sequences/sequences";
import {
  useGetProject,
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "@api/generated/projects/projects";
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

  // Annotation toggles: seeded from the project's persisted `export` config, held
  // locally so the current dialog state rides the export request, and persisted
  // back to the config on every change.
  const queryClient = useQueryClient();
  const { data: projectEnvelope } = useGetProject(projectId);
  const projectExport = projectEnvelope?.status === 200 ? projectEnvelope.data.export : null;
  const updateProject = useUpdateProject();

  const [includeReferences, setIncludeReferences] = useState(true);
  const [includeMarginAnnotations, setIncludeMarginAnnotations] = useState(true);

  // Resync from the server config once the project loads (and if it changes).
  useEffect(() => {
    if (!projectExport) return;
    setIncludeReferences(projectExport.includeReferences);
    setIncludeMarginAnnotations(projectExport.includeMarginAnnotations);
  }, [projectExport]);

  const persistExportConfig = (patch: ProjectUpdate["export"]) => {
    updateProject.mutate(
      { projectId, data: { export: patch } as ProjectUpdate },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        },
      },
    );
  };

  const handleIncludeReferencesChange = (next: boolean) => {
    setIncludeReferences(next);
    persistExportConfig({ includeReferences: next });
  };

  const handleIncludeMarginAnnotationsChange = (next: boolean) => {
    setIncludeMarginAnnotations(next);
    persistExportConfig({ includeMarginAnnotations: next });
  };

  const mutation = useExportSequence();

  const handleExport = () => {
    if (!activeSequenceId) return;
    mutation.mutate(
      {
        projectId,
        sequenceId: activeSequenceId,
        data: { format, includeReferences, includeMarginAnnotations },
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
              checked={includeReferences}
              onCheckedChange={(checked) => handleIncludeReferencesChange(checked === true)}
            />
            <CheckboxField
              label="Include margin annotations"
              checked={includeMarginAnnotations}
              onCheckedChange={(checked) => handleIncludeMarginAnnotationsChange(checked === true)}
            />
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
