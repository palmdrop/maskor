import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteProject, getListProjectsQueryKey } from "@api/generated/projects/projects";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Button } from "@components/ui/button";
import { BusyButton } from "@components/ui/busy-button";
import { Input } from "@components/ui/input";
import { Field } from "@components/ui/field";
import { Checkbox } from "@components/ui/checkbox";

type Step = "confirm" | "result";

type DeregisterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
};

export const DeregisterDialog = ({
  open,
  onOpenChange,
  projectId,
  projectName,
}: DeregisterDialogProps) => {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [nameConfirmation, setNameConfirmation] = useState("");
  const [step, setStep] = useState<Step>("confirm");
  const [deletionMethod, setDeletionMethod] = useState<"trash" | "hard-delete" | null>(null);
  const queryClient = useQueryClient();

  const canConfirm = !deleteFiles || nameConfirmation === projectName;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteFiles(false);
      setNameConfirmation("");
      setStep("confirm");
      setDeletionMethod(null);
      mutation.reset();
    }
    onOpenChange(nextOpen);
  };

  const mutation = useDeleteProject({
    mutation: {
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        if (response.status === 200) {
          setDeletionMethod(response.data.method);
          setStep("result");
        } else {
          handleOpenChange(false);
        }
      },
    },
  });

  const handleConfirm = () => {
    if (!canConfirm) return;
    mutation.mutate({ projectId, data: { deleteFiles } });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "confirm" ? "Deregister project" : "Project deregistered"}
          </DialogTitle>
        </DialogHeader>

        {step === "confirm" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Remove <strong>{projectName}</strong> from Maskor? The vault folder will not be
              deleted unless you check the box below.
            </p>

            <div className="flex items-center gap-2">
              <Checkbox
                id="delete-files-checkbox"
                checked={deleteFiles}
                onCheckedChange={(checked) => {
                  setDeleteFiles(checked === true);
                  setNameConfirmation("");
                }}
              />
              <label htmlFor="delete-files-checkbox" className="cursor-pointer text-sm">
                Also delete the vault folder from disk
              </label>
            </div>

            {deleteFiles && (
              <Field
                label={
                  <>
                    Type <strong>{projectName}</strong> to confirm permanent deletion
                  </>
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    value={nameConfirmation}
                    onChange={(e) => setNameConfirmation(e.target.value)}
                    placeholder={projectName}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirm();
                    }}
                  />
                )}
              </Field>
            )}

            {mutation.error && <p className="text-xs text-destructive">{mutation.error.message}</p>}
          </div>
        )}

        {step === "result" && (
          <p className="text-sm">
            {deletionMethod === "trash"
              ? "The vault folder has been moved to Trash."
              : "The vault folder has been permanently deleted."}
          </p>
        )}

        <DialogFooter>
          {step === "confirm" ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <BusyButton
                variant="destructive"
                onClick={handleConfirm}
                disabled={!canConfirm}
                isPending={mutation.isPending}
                pendingLabel="Deregistering…"
              >
                Deregister
              </BusyButton>
            </>
          ) : (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
