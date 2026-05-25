import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateDraft, getListDraftsQueryKey } from "@api/generated/drafts/drafts";
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

type CreateDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  defaultName: string;
};

export const CreateDraftDialog = ({
  open,
  onOpenChange,
  projectId,
  defaultName,
}: CreateDraftDialogProps) => {
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setNote("");
    }
  }, [open, defaultName]);

  const mutation = useCreateDraft({
    mutation: {
      onSuccess: (response) => {
        if (response.status === 201) {
          void queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey(projectId) });
          onOpenChange(false);
        }
      },
    },
  });

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedNote = note.trim();
    mutation.mutate({
      projectId,
      data: trimmedNote ? { name: trimmedName, note: trimmedNote } : { name: trimmedName },
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  const errorMessage = (() => {
    if (mutation.error) return mutation.error.message;
    const response = mutation.data;
    if (response && response.status !== 201) {
      const body = response.data as { error?: string; message?: string } | undefined;
      return body?.message ?? body?.error ?? "Failed to create draft.";
    }
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Create draft</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-draft-name">Name</Label>
            <Input
              id="create-draft-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-draft-note">Note (optional)</Label>
            <Input
              id="create-draft-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why are you saving this draft?"
            />
          </div>

          {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
