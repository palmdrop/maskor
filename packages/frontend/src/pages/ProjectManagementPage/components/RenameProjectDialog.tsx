import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateProject, getListProjectsQueryKey } from "@api/generated/projects/projects";
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-project-name">Project name</Label>
            <Input
              id="rename-project-name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Project name"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

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
          <Button onClick={handleSubmit} disabled={!nameInput.trim() || mutation.isPending}>
            {mutation.isPending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
