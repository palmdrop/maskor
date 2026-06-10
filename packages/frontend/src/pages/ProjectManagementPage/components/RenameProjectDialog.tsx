import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateProject, getListProjectsQueryKey } from "@api/generated/projects/projects";
import { ConfirmDialog } from "@components/ui/confirm-dialog";
import { Input } from "@components/ui/input";
import { Field } from "@components/ui/field";

type RenameProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currentName: string;
};

export const RenameProjectDialog = ({
  open,
  onOpenChange,
  projectId,
  currentName,
}: RenameProjectDialogProps) => {
  const [nameInput, setNameInput] = useState(currentName);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setNameInput(currentName);
  }, [open, currentName]);

  const mutation = useUpdateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        onOpenChange(false);
      },
    },
  });

  const handleSubmit = () => {
    if (!nameInput.trim()) return;
    mutation.mutate({ projectId, data: { name: nameInput.trim() } });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) mutation.reset();
    onOpenChange(nextOpen);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Rename project"
      body={
        <Field label="Project name">
          {(control) => (
            <Input
              {...control}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Project name"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          )}
        </Field>
      }
      error={mutation.error?.message}
      confirmLabel="Rename"
      pendingLabel="Renaming…"
      onConfirm={handleSubmit}
      isPending={mutation.isPending}
      disabled={!nameInput.trim()}
    />
  );
};
