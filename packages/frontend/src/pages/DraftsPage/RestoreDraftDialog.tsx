import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRestoreDraft, getListDraftsQueryKey } from "@api/generated/drafts/drafts";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restore draft</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Replace the project with <strong>{draftName}</strong>? All current vault content
            (fragments, aspects, notes, references, sequences, configuration) is overwritten.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="save-current-first"
              checked={saveCurrentFirst}
              onChange={(event) => setSaveCurrentFirst(event.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border border-input"
            />
            <label htmlFor="save-current-first" className="cursor-pointer text-sm">
              Save current state as a draft first
            </label>
          </div>

          {saveCurrentFirst && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pre-restore-name">Name for the pre-restore draft</Label>
              <Input
                id="pre-restore-name"
                value={preRestoreName}
                onChange={(event) => setPreRestoreName(event.target.value)}
              />
            </div>
          )}

          {mutation.error && <p className="text-xs text-destructive">{mutation.error.message}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? "Restoring…" : "Restore draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
