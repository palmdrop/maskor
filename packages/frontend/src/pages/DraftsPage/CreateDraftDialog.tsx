import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateDraft, getListDraftsQueryKey } from "@api/generated/drafts/drafts";
import { ConfirmDialog } from "@components/ui/confirm-dialog";
import { Input } from "@components/ui/input";
import { Field } from "@components/ui/field";

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
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Create draft"
      body={
        <div className="flex flex-col gap-4">
          <Field label="Name">
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(event) => setName(event.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSubmit();
                }}
              />
            )}
          </Field>
          <Field label="Note (optional)">
            {(control) => (
              <Input
                {...control}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why are you saving this draft?"
              />
            )}
          </Field>
        </div>
      }
      error={errorMessage}
      confirmLabel="Create"
      pendingLabel="Creating…"
      onConfirm={handleSubmit}
      isPending={mutation.isPending}
      disabled={!name.trim()}
    />
  );
};
