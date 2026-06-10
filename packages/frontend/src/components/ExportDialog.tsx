import { useState } from "react";
import { useExportSequence } from "@api/generated/export/export";
import type { ExportSequenceBody } from "@api/generated/maskorAPI.schemas";
import { useListSequences } from "@api/generated/sequences/sequences";
import { ConfirmDialog } from "@components/ui/confirm-dialog";
import { Field } from "@components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";

type Format = ExportSequenceBody["format"];

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

  const mutation = useExportSequence();

  const handleExport = () => {
    if (!activeSequenceId) return;
    mutation.mutate(
      { projectId, sequenceId: activeSequenceId, data: { format } },
      {
        onSuccess: (response) => {
          if (response.status === 200) {
            const blob = response.data as Blob;
            const fileName = getFileNameFromHeaders(response.headers) ?? `export.${format}`;
            triggerDownload(blob, fileName);
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
