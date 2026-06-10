import { useQueryClient } from "@tanstack/react-query";
import { useDeleteDraft, getListDraftsQueryKey } from "@api/generated/drafts/drafts";
import { ConfirmDialog } from "@components/ui/confirm-dialog";

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
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Delete draft"
      body={
        <p className="text-sm">
          Delete <strong>{draftName}</strong>? This permanently removes the snapshot from disk.
        </p>
      }
      error={mutation.error?.message}
      confirmLabel="Delete draft"
      pendingLabel="Deleting…"
      variant="destructive"
      onConfirm={handleConfirm}
      isPending={mutation.isPending}
    />
  );
};
