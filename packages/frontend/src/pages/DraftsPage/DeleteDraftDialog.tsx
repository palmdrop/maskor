import { useQueryClient } from "@tanstack/react-query";
import { useDeleteDraft, getListDraftsQueryKey } from "@api/generated/drafts/drafts";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Button } from "@components/ui/button";

type DeleteDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  draftId: string;
  draftName: string;
};

export const DeleteDraftDialog = ({
  open,
  onOpenChange,
  projectId,
  draftId,
  draftName,
}: DeleteDraftDialogProps) => {
  const queryClient = useQueryClient();

  const mutation = useDeleteDraft({
    mutation: {
      onSuccess: (response) => {
        if (response.status === 204) {
          void queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey(projectId) });
          onOpenChange(false);
        }
      },
    },
  });

  const handleConfirm = () => {
    mutation.mutate({ projectId, draftId });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete draft</DialogTitle>
        </DialogHeader>

        <p className="text-sm">
          Delete <strong>{draftName}</strong>? This permanently removes the snapshot from disk.
        </p>

        {mutation.error && <p className="text-xs text-destructive">{mutation.error.message}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? "Deleting…" : "Delete draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
