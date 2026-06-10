import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRestoreDraft, getListDraftsQueryKey } from "@api/generated/drafts/drafts";
import { ConfirmDialog } from "@components/ui/confirm-dialog";
import { Input } from "@components/ui/input";
import { Field } from "@components/ui/field";
import { Checkbox } from "@components/ui/checkbox";

type RestoreDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  draftId: string;
  draftName: string;
};

const defaultPreRestoreName = (): string => `Pre-restore — ${new Date().toISOString()}`;

export const RestoreDraftDialog = ({
  open,
  onOpenChange,
  projectId,
  draftId,
  draftName,
}: RestoreDraftDialogProps) => {
  const [saveCurrentFirst, setSaveCurrentFirst] = useState(true);
  const [preRestoreName, setPreRestoreName] = useState(defaultPreRestoreName());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setSaveCurrentFirst(true);
      setPreRestoreName(defaultPreRestoreName());
    }
  }, [open]);

  const mutation = useRestoreDraft({
    mutation: {
      onSuccess: (response) => {
        if (response.status === 200) {
          void queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey(projectId) });
          // Refresh every project-scoped query so the UI reflects restored content
          // immediately, in addition to the SSE-triggered invalidation.
          void queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0];
              return typeof key === "string" && key.startsWith(`/projects/${projectId}/`);
            },
          });
          onOpenChange(false);
        }
      },
    },
  });

  const handleConfirm = () => {
    const trimmed = preRestoreName.trim();
    mutation.mutate({
      projectId,
      draftId,
      data: {
        saveCurrentFirst,
        ...(saveCurrentFirst && trimmed ? { preRestoreName: trimmed } : {}),
      },
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Restore draft"
      body={
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Replace the project with <strong>{draftName}</strong>? All current vault content
            (fragments, aspects, notes, references, sequences, configuration) is overwritten.
          </p>

          <div className="flex items-center gap-2">
            <Checkbox
              id="save-current-first"
              checked={saveCurrentFirst}
              onCheckedChange={(checked) => setSaveCurrentFirst(checked === true)}
            />
            <label htmlFor="save-current-first" className="cursor-pointer text-sm">
              Save current state as a draft first
            </label>
          </div>

          {saveCurrentFirst && (
            <Field label="Name for the pre-restore draft">
              {(control) => (
                <Input
                  {...control}
                  value={preRestoreName}
                  onChange={(event) => setPreRestoreName(event.target.value)}
                />
              )}
            </Field>
          )}
        </div>
      }
      error={mutation.error?.message}
      confirmLabel="Restore draft"
      pendingLabel="Restoring…"
      variant="destructive"
      onConfirm={handleConfirm}
      isPending={mutation.isPending}
    />
  );
};
